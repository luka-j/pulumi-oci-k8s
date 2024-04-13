import * as child_process from "child_process";
import {LocalWorkspace} from "@pulumi/pulumi/automation";
import {plainLog, startSshTunnel, stopSshTunnel} from "./utils";

const PROJECT_DOMAIN = "luka-j.rocks";
const PROJECT_SUBDOMAIN = "master";
const PROJECT_HOST = `${PROJECT_SUBDOMAIN}.${PROJECT_DOMAIN}`;

const command = process.argv[2];
const stackName = process.argv[3];

const OCI_STACK_DIR = "./stacks/oci";
const K8S_STACK_DIR = "./stacks/k8s";
const CLOUDFLARE_STACK_DIR = "./stacks/cloudflare";
const GITHUB_STACK_DIR = "./stacks/github";

const ORG_CHART_FILE = process.cwd() + '/org-chart.yaml';

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

async function upGithubStack(stackName: string, orgChartFile: string) {
    const githubStack = await LocalWorkspace.createOrSelectStack({
        workDir: GITHUB_STACK_DIR,
        stackName: `gh_${stackName}`
    });
    await githubStack.setConfig("orgChartFile", {value: orgChartFile});
    await githubStack.setConfig("host", {value: PROJECT_HOST});

    const githubResult = await githubStack.up({onOutput: plainLog});
    const githubOutputs = githubResult.outputs;
    const orgName = githubOutputs.org.value.name;
    const appOfAppsUrl = githubOutputs.argoAppOfAppsRepo.value.httpCloneUrl;
    return {orgName, appOfAppsUrl}
}

async function upOciStack(stackName: string) {
    const ociStack = await LocalWorkspace.createOrSelectStack({
        workDir: OCI_STACK_DIR,
        stackName: `oci_${stackName}`
    });
    const ociResult = await ociStack.up({onOutput: plainLog});
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
    const cloudflareStack = await LocalWorkspace.createOrSelectStack({
        workDir: CLOUDFLARE_STACK_DIR,
        stackName: `cf_${stackName}`
    });
    await cloudflareStack.setConfig("ip", {value: publicIp});
    await cloudflareStack.setConfig("domain", {value: PROJECT_DOMAIN});
    await cloudflareStack.setConfig("subdomain", {value: PROJECT_SUBDOMAIN});
    await cloudflareStack.setConfig("kubeconfig", {value: kubeconfig});
    await cloudflareStack.setConfig("annotateIngressWithCertManager", {value: argoIngressName});
    await cloudflareStack.setConfig("certManagerIssuer", {value: certManagerIssuer})
    const cloudflareResult = await cloudflareStack.up({onOutput: plainLog});
}


if (command === undefined || stackName === undefined) {
    console.log(`command and stack name must be passed as arguments`);
    process.exit(1);
}

process.env.PULUMI_CONFIG_PASSPHRASE_FILE=process.cwd() + '/pulumi_passphrase'

if (command === "preview") {
    console.error("Previewing stacks is not supported. Use Pulumi CLI and preview stacks one by one manually.")
} else if (command === "up") {
    console.log(`Running [${command}] on stack [${stackName}]`);
    up(stackName);
} else if (command === "down" || command === "destroy") {
    console.error("Destroying stacks is not supported. Use Pulumi CLI and destroy stacks one by one manually.")
} else {
    console.log(`Unsupported command [${command}]. Exiting...`);
    process.exit(1);
}