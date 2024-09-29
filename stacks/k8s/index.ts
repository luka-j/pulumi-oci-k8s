import IngressController from "./components/ingressController";
import {Config} from "@pulumi/pulumi";
import * as pulumi_kubernetes from "@pulumi/kubernetes";
import * as oci from "@pulumi/oci";
import * as YAML from 'yaml';
import CertManager from "./components/certmanager";
import ArgoCD from "./components/argocd";
import * as pulumi from "@pulumi/pulumi";
import * as fs from 'fs';

const config = new Config();

const kubeConfig = oci.containerengine.getClusterKubeConfigOutput({
    clusterId: config.require("okeClusterId"),
});

const kubeConfigFile = process.cwd() + "/local.kubeconfig";
const localKubeConfig = kubeConfig.content
    .apply(kubeConfig => {
        const parsed = YAML.parse(kubeConfig);
        parsed.clusters[0].cluster.server = config.require("localClusterEndpoint");
        if(config.getBoolean("ignoreKubeconfigCert")) {
            parsed.clusters[0].cluster["insecure-skip-tls-verify"] = true;
            parsed.clusters[0].cluster["certificate-authority-data"] = undefined;
        }
        const kubeconfigContent = YAML.stringify(parsed);
        fs.writeFileSync(kubeConfigFile, kubeconfigContent);
        return kubeconfigContent;
    });

const kubernetesProvider = new pulumi_kubernetes.Provider("kubernetes_provider", {
    kubeconfig: localKubeConfig,
    skipUpdateUnreachable: true
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

var argoCD;
pulumi.all([config.requireSecret("githubClientId"), config.requireSecret("githubClientSecret")])
    .apply(([ghClientId, ghClientSecret]) => {
        argoCD = new ArgoCD("argo", {
            version: config.require("argoVersion"),
            host: config.require("argoHost"),
            namespace: "argocd",
            ingressName: "argo-server-ingress",
            githubClientId: ghClientId,
            githubClientSecret: ghClientSecret,
            githubOrgName: config.require("githubOrgName"),
            kubeconfigFile: kubeConfigFile,
            appOfAppsRepo: config.require("appOfAppsRepo")
        }, {
            provider: kubernetesProvider,
            dependsOn: ingressController,
        });
});


export {
    ingressController,
    certManager,
    argoCD,
    localKubeConfig
}