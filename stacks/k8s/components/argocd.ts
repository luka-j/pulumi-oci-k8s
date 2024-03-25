import {ComponentResource, ComponentResourceOptions, output} from "@pulumi/pulumi";
import {Release} from "@pulumi/kubernetes/helm/v3/release";
import {Ingress} from "@pulumi/kubernetes/networking/v1";
import {ConfigMap, ConfigMapPatch} from "@pulumi/kubernetes/core/v1";

class ArgoCD extends ComponentResource {
    public argoCD: Release;
    public argoIngress: Ingress;
    public argoCmPatch: ConfigMapPatch;

    constructor(name: string, args: { version: string, host: string, githubClientId: string,
                    githubClientSecret: string, githubOrgName: string, namespace: string, ingressName: string },
                opts?: ComponentResourceOptions) {
        super("master:k8s:ArgoCD", name, args, opts);

        const NAMESPACE = args.namespace;

        this.argoCD = new Release(`${name}_release`, {
            chart: "argo-cd",
            version: args.version,
            namespace: NAMESPACE,
            createNamespace: true,
            name: "argocd",
            repositoryOpts: {
                repo: "https://argoproj.github.io/argo-helm"
            },
            values: {
                configs: {
                    params: {
                        "server.insecure": true,
                    },
                },
                installCRDs: true
            },
        }, { parent: this });

        this.argoIngress = new Ingress(`${name}_ingress`, {
            metadata: {
                name: args.ingressName,
                namespace: NAMESPACE,
            },
            spec: {
                ingressClassName: "nginx",
                rules: [
                    {
                        host: args.host,
                        http: {
                            paths: [
                                {
                                    path: "/",
                                    pathType: "Prefix",
                                    backend: {
                                        service: {
                                            name: "argocd-server",
                                            port: {
                                                name: "http"
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ],
                tls: [
                    {
                        hosts: [
                            args.host
                        ],
                        secretName: "argocd-tls-secret"
                    }
                ]
            }
        }, { parent: this, dependsOn: this.argoCD });

        const existingConfigMap = output(
            ConfigMap.get("argo_cm", NAMESPACE + "/argocd-cm",
                { parent: this, dependsOn: this.argoCD })
        );
        this.argoCmPatch = new ConfigMapPatch("argo_cm_patch", {
            metadata: existingConfigMap.metadata,
            data: {
                "url": `https://${args.host}`,
                "dex.config":
`connectors:
 - type: github
   id: github
   name: GitHub
   config:
     clientID: ${args.githubClientId}
     clientSecret: ${args.githubClientId}
     orgs:
     - name: ${args.githubOrgName}`
            },
        }, { parent: this });

        // todo argo app of apps

        this.registerOutputs({
            argoReleaseId: this.argoCD.id,
            argoIngressId: this.argoIngress.id,
            argoCmPatchId: this.argoCmPatch.id,
        });
    }
}

export default ArgoCD;