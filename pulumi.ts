import * as child_process from "child_process";
import {LocalWorkspace} from "@pulumi/pulumi/automation";
import {plainLog, startSshTunnel, stopSshTunnel} from "./utils";

const PROJECT_DOMAIN = "luka-j.rocks";
const PROJECT_SUBDOMAIN = "master";
const PROJECT_HOST = `${PROJECT_SUBDOMAIN}.${PROJECT_DOMAIN}`;

const OCI_STACK_DIR = "./stacks/oci";
const K8S_STACK_DIR = "./stacks/k8s";
const CLOUDFLARE_STACK_DIR = "./stacks/cloudflare";
const GITHUB_STACK_DIR = "./stacks/github";

const ORG_CHART_FILE = process.cwd() + '/org-chart.yaml';

const command = process.argv[2];
const stackName = process.argv[3];

if (command === undefined || stackName === undefined) {
    console.log(`command and stack name must be passed as arguments`);
    process.exit(1);
}

process.env.PULUMI_CONFIG_PASSPHRASE_FILE=process.cwd() + '/pulumi_passphrase'

if (command === "up") {
    console.log(`Running [${command}] on stack [${stackName}]`);
    up(stackName);
} else if (command === "down" || command === "destroy") {
    down(false);
} else if (command === "destroyAll") {
    down(true);
} else if (command === "preview") {
    console.error("Previewing stacks is not supported. Use Pulumi CLI and preview stacks one by one manually.")
} else {
    console.log(`Unsupported command [${command}]. Exiting...`);
    process.exit(1);
}

async function up(stackName: string) {
    let tunnel: child_process.ChildProcessWithoutNullStreams | undefined;
    try {
        const {orgName, appOfAppsUrl} = await upGithubStack(stackName, ORG_CHART_FILE);
        const {okeClusterId, okeEndpoint, bastionSessionId} = await upOciStack(stackName);

        tunnel = startSshTunnel('6443', bastionSessionId, okeEndpoint);

        const {publicIp, clusterIssuerName, kubeconfig, argoIngressName} = await upK8sStack(stackName, okeClusterId, orgName, appOfAppsUrl);
        await upCloudflareStack(stackName, publicIp, kubeconfig, argoIngressName, clusterIssuerName);
    } finally {
        stopSshTunnel(tunnel);
        console.log("Tunnel stopped");
    }
}

const githubStack = async () => await LocalWorkspace.createOrSelectStack({
    workDir: GITHUB_STACK_DIR,
    stackName: `gh_${stackName}`
});
const ociStack = async () => await LocalWorkspace.createOrSelectStack({
    workDir: OCI_STACK_DIR,
    stackName: `oci_${stackName}`
});
const cloudflareStack = async () => await LocalWorkspace.createOrSelectStack({
    workDir: CLOUDFLARE_STACK_DIR,
    stackName: `cf_${stackName}`
});

async function upGithubStack(stackName: string, orgChartFile: string) {
    const stack = await githubStack()
    await stack.setConfig("orgChartFile", {value: orgChartFile});
    await stack.setConfig("host", {value: PROJECT_HOST});

    const githubResult = await stack.up({onOutput: plainLog});
    const githubOutputs = githubResult.outputs;
    const orgName = githubOutputs.org.value.name;
    const appOfAppsUrl = githubOutputs.argoAppOfAppsRepo.value.httpCloneUrl;
    return {orgName, appOfAppsUrl}
}

async function upOciStack(stackName: string) {
    const stack = await ociStack();
    const ociResult = await stack.up({onOutput: plainLog});
    const ociOutputs = ociResult.outputs;

    const okeClusterId = ociOutputs.cluster.value.okeCluster.id;
    const okeEndpoint = ociOutputs.cluster.value.okeCluster.endpoints[0].privateEndpoint;
    const bastionSessionId = ociOutputs.bastionSession.value.id;
    return {okeClusterId, okeEndpoint, bastionSessionId}
}

async function upK8sStack(stackName: string, okeClusterId: string, githubOrgName: string, appOfAppsRepo: string) {
    const k8sStack = await LocalWorkspace.createOrSelectStack({
        workDir: K8S_STACK_DIR,
        stackName: `k8s_${stackName}`
    });
    await k8sStack.setConfig("okeClusterId", {value: okeClusterId});
    await k8sStack.setConfig("localClusterEndpoint", {value: "https://127.0.0.1:6443"});
    await k8sStack.setConfig("ignoreKubeconfigCert", {value: "true"});
    await k8sStack.setConfig("argoHost", {value: `argo.${PROJECT_HOST}`});
    await k8sStack.setConfig("githubOrgName", {value: githubOrgName});
    await k8sStack.setConfig("appOfAppsRepo", {value: appOfAppsRepo})
    const k8sResult = await k8sStack.up({onOutput: plainLog});
    const k8sOutputs = k8sResult.outputs;

    const argoIngressMetadata = k8sOutputs.argoCD.value.argoIngress.metadata;
    const lbs = k8sOutputs.argoCD.value.argoIngress.status.loadBalancer.ingress;
    const publicIp = lbs.filter((lb:any) => !lb.ip.startsWith("10."))[0].ip;
    const clusterIssuerName = k8sOutputs.certManager.value.clusterIssuer.metadata.name;
    const kubeconfig = k8sOutputs.localKubeConfig.value;
    console.log(`public ip is ${publicIp}`);

    return {publicIp, clusterIssuerName, kubeconfig,
        argoIngressName: `${argoIngressMetadata.namespace}/${argoIngressMetadata.name}`}
}

async function upCloudflareStack(stackName: string, publicIp: string, kubeconfig: string,
                                 argoIngressName: string, certManagerIssuer: string) {
    const stack = await cloudflareStack();
    await stack.setConfig("ip", {value: publicIp});
    await stack.setConfig("domain", {value: PROJECT_DOMAIN});
    await stack.setConfig("subdomain", {value: PROJECT_SUBDOMAIN});
    await stack.setConfig("kubeconfig", {value: kubeconfig});
    await stack.setConfig("annotateIngressWithCertManager", {value: argoIngressName});
    await stack.setConfig("certManagerIssuer", {value: certManagerIssuer})
    const cloudflareResult = await stack.up({onOutput: plainLog});
}

async function down(deleteGithub : boolean) {
    console.log("Destroying OCI infrastructure. This will take a while...");
    await (await ociStack()).destroy();
    if(deleteGithub) {
        console.log("Done. Deleting GitHub repos...");
        await (await githubStack()).destroy();
    }
    console.log("Done. Deleting DNS records and rules from CloudFlare...");
    await (await cloudflareStack()).destroy();
    console.log("Done.")
}