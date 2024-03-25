import IngressController from "./components/ingressController";
import {Config} from "@pulumi/pulumi";
import * as pulumi_kubernetes from "@pulumi/kubernetes";
import * as oci from "@pulumi/oci";
import * as YAML from 'yaml';
import CertManager from "./components/certmanager";
import ArgoCD from "./components/argocd";


const config = new Config();

const kubeConfig = oci.containerengine.getClusterKubeConfigOutput({
    clusterId: config.require("okeClusterId"),
});

const localKubeConfig = kubeConfig.content
    .apply(kubeConfig => {
        const parsed = YAML.parse(kubeConfig);
        parsed.clusters[0].cluster.server = config.require("localClusterEndpoint");
        if(config.getBoolean("ignoreKubeconfigCert")) {
            parsed.clusters[0].cluster["insecure-skip-tls-verify"] = true;
            parsed.clusters[0].cluster["certificate-authority-data"] = undefined;
        }
        console.log('Modified parsed kubeconfig:')
        console.log(parsed)
        return YAML.stringify(parsed);
    });

localKubeConfig.apply(c => {console.error(c); return c;})

const kubernetesProvider = new pulumi_kubernetes.Provider("kubernetes_provider", {
    kubeconfig: localKubeConfig
});

const ingressController = new IngressController("ingress", {
    version: config.require("ingressVersion"),
    cpuRequest: config.require("ingressCpuRequest"),
    memoryRequest: config.require("ingressMemoryRequest"),
    maxReplicas: config.requireNumber("ingressMaxReplicas"),
}, {
    provider: kubernetesProvider
});

const certManager = new CertManager("cert_manager", {
    version: config.require("certManagerVersion"),
    acmeEmail: config.require("acmeEmail"),
}, {
    provider: kubernetesProvider,
    dependsOn: ingressController,
});

const argoCD = new ArgoCD("argo", {
    version: config.require("argoVersion"),
    host: config.require("argoHost"),
    namespace: "argocd",
    ingressName: "argo-server-ingress",
    githubClientId: "370491d973ac94fecaf9",
    githubClientSecret: "ebfb6c7db3812186a6bfe734f01bf81664354b76",
    githubOrgName: "Runtime-T-error"  // todo get this from github stack
}, {
    provider: kubernetesProvider,
    dependsOn: ingressController,
});

export {
    ingressController,
    certManager,
    argoCD
}