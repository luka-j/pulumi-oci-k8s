import * as child_process from "child_process";
import {LocalWorkspace} from "@pulumi/pulumi/automation";
import {plainLog, startSshTunnel, stopSshTunnel} from "./utils";

const PROJECT_DOMAIN = "luka-j.rocks";
const PROJECT_SUBDOMAIN = "master";
const GITHUB_OWNER = "lukaj-master";
const PROJECT_HOST = `${PROJECT_SUBDOMAIN}.${PROJECT_DOMAIN}`;

const command = process.argv[2];
const stackName = process.argv[3];

const OCI_STACK_DIR = "./stacks/oci";
const K8S_STACK_DIR = "./stacks/k8s";
const CLOUDFLARE_STACK_DIR = "./stacks/cloudflare";
const GITHUB_STACK_DIR = "./stacks/github";

const ORG_CHART_FILE = process.cwd() + '/org-chart.yaml';

async function preview(stackName: string) {
    console.log("Preview stack")
    const ociStack = await LocalWorkspace.createOrSelectStack({
        workDir: OCI_STACK_DIR,
        stackName: stackName,
    });
    ociStack.preview().then((pr) => {
        process.stdout.write(pr.stdout);
        process.stdout.write(pr.stderr)
    });

    // todo preview other stacks
}

async function up(stackName: string) {
    let tunnel: child_process.ChildProcessWithoutNullStreams | undefined;
    try {
        await upGithubStack(stackName, ORG_CHART_FILE);
        // const {okeClusterId, okeEndpoint, bastionSessionId} = await upOciStack(stackName);
        //
        // tunnel = startSshTunnel('6443', bastionSessionId, okeEndpoint);
        //
        // const {publicIp, argoIngressName, clusterIssuerName} = await upK8sStack(stackName, okeClusterId);
        // await upCloudflareStack(stackName, publicIp, argoIngressName, clusterIssuerName);
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

    const cloudflareResult = await githubStack.up({onOutput: plainLog});
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

async function upK8sStack(stackName: string, okeClusterId: string) {
    const k8sStack = await LocalWorkspace.createOrSelectStack({
        workDir: K8S_STACK_DIR,
        stackName: `k8s_${stackName}`
    });
    await k8sStack.setConfig("okeClusterId", {value: okeClusterId});
    await k8sStack.setConfig("localClusterEndpoint", {value: "https://127.0.0.1:6443"});
    await k8sStack.setConfig("ignoreKubeconfigCert", {value: "true"});
    await k8sStack.setConfig("argoHost", {value: `argo.${PROJECT_HOST}`});
    const k8sResult = await k8sStack.up({onOutput: plainLog});
    const k8sOutputs = k8sResult.outputs;

    const argoIngressMetadata = k8sOutputs.argoCD.value.argoIngress.metadata;
    const publicIp = k8sOutputs.argoCD.value.argoIngress.status.loadBalancer.ingress[0].ip;
    const clusterIssuerName = k8sOutputs.certManager.value.clusterIssuer.metadata.name;
    console.log(`public ip is ${publicIp}`);

    return {publicIp, clusterIssuerName, argoIngressName: `${argoIngressMetadata.namespace}/${argoIngressMetadata.name}`}
}

async function upCloudflareStack(stackName: string, publicIp: string, argoIngressName: string, certManagerIssuer: string) {
    const cloudflareStack = await LocalWorkspace.createOrSelectStack({
        workDir: CLOUDFLARE_STACK_DIR,
        stackName: `cf_${stackName}`
    });
    await cloudflareStack.setConfig("ip", {value: publicIp});
    await cloudflareStack.setConfig("domain", {value: PROJECT_DOMAIN});
    await cloudflareStack.setConfig("subdomain", {value: PROJECT_SUBDOMAIN});
    await cloudflareStack.setConfig("annotateIngressWithCertManager", {value: argoIngressName});
    await cloudflareStack.setConfig("certManagerIssuer", {value: certManagerIssuer})
    const cloudflareResult = await cloudflareStack.up({onOutput: plainLog});
}

async function destroy(stackName: string) {
    // todo destroy other stacks
    const ociStack = await LocalWorkspace.createOrSelectStack({
        workDir: OCI_STACK_DIR,
        stackName: stackName
    });
    console.log(await ociStack.destroy({onOutput: plainLog}));
}


if (command === undefined || stackName === undefined) {
    console.log(`command and stack name must be passed as arguments`);
    process.exit(1);
}

process.env.PULUMI_CONFIG_PASSPHRASE_FILE=process.cwd() + '/pulumi_passphrase'

if (command === "preview") {
    preview(stackName);
} else if (command === "up") {
    console.log(`Running [${command}] on stack [${stackName}]`);
    up(stackName);
} else if (command === "down" || command === "destroy") {
    console.log(`Running [${command}] on stack [${stackName}]`);
    destroy(stackName);
} else {
    console.log(`Unsupported command [${command}]. Exiting...`);
    process.exit(1);
}



/*
  PPTP server setup (Ubuntu):

echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
sysctl -p /etc/sysctl.conf
iptables -t nat -A POSTROUTING -o ens3 -j MASQUERADE
apt-get update
apt-get -y install pptpd
echo 'connections 2' >> /etc/pptpd.conf
echo 'localip 10.0.255.1' >> /etc/pptpd.conf
echo 'remoteip 10.0.255.2-254' >> /etc/pptpd.conf
echo 'ms-dns 1.0.0.1' >> /etc/ppp/pptpd-options
echo 'ms-dns 1.1.1.1' >> /etc/ppp/pptpd-options
echo 'master pptpd secretpassword *' >> /etc/ppp/chap-secrets
systemctl restart pptpd
systemctl enable pptpd
iptables -A INPUT -p 47 -j ACCEPT
iptables -A OUTPUT -p 47 -j ACCEPT
iptables -I INPUT -p tcp --dport 1723 -j ACCEPT

 */