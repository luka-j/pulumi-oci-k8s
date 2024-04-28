import {ComponentResource, ComponentResourceOptions, Output, output} from "@pulumi/pulumi";
import {Release} from "@pulumi/kubernetes/helm/v3/release";
import {Ingress} from "@pulumi/kubernetes/networking/v1";
import {ConfigMapPatch} from "@pulumi/kubernetes/core/v1";
import {CustomResource} from "@pulumi/kubernetes/apiextensions";
import {local} from "@pulumi/command";

class ArgoCD extends ComponentResource {
    public argoCD: Release;
    public argoIngress: Ingress;
    public argoCmPatch: ConfigMapPatch;
    public rbacCmPatch: ConfigMapPatch;
    public restartArgoCommand: local.Command;
    public appOfApps: CustomResource;

    constructor(name: string, args: { version: string, host: string, githubClientId: string,
                    githubClientSecret: string, githubOrgName: string, namespace: string, ingressName: string,
                    kubeconfigFile: string, appOfAppsRepo: string},
                opts?: ComponentResourceOptions) {
        super("master:k8s:ArgoCD", name, args, opts);

        const ns = args.namespace;

        this.argoCD = new Release(`${name}_release`, {
            chart: "argo-cd",
            version: args.version,
            namespace: ns,
            createNamespace: true,
            name: "argocd",
            repositoryOpts: {
                repo: "https://argoproj.github.io/argo-helm"
            },
            values: {
                crds: {
                    install: true
                },
                global: {
                    domain: args.host,
                },
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
                namespace: ns,
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

        this.argoCmPatch = new ConfigMapPatch("argo_cm_patch", {
            metadata: {
                name: "argocd-cm",
                namespace: ns,
                annotations: {
                    "pulumi.com/patchForce": "true",
                }
            },
            data: {
                "dex.config":
                    `connectors:
 - type: github
   id: github
   name: GitHub
   config:
     clientID: ${args.githubClientId}
     clientSecret: ${args.githubClientSecret}
     orgs:
     - name: ${args.githubOrgName}`
            },
        }, { parent: this, dependsOn: this.argoCD });

        this.rbacCmPatch = new ConfigMapPatch("rbac_cm_patch", {
            metadata: {
                name: "argocd-rbac-cm",
                namespace: ns,
                annotations: {
                    "pulumi.com/patchForce": "true",
                },
            },
            data: {
                "policy.csv":
                    `p, role:sync, applications, sync, */*, allow
g, role:sync, role:readonly`,
                "policy.default": "role:sync",
            },
        }, { parent: this, dependsOn: this.argoCD });

        this.restartArgoCommand = new local.Command(`${name}_argo_restart`, {
            create: `kubectl --kubeconfig ${args.kubeconfigFile} delete pods --all -n ${ns}`
        }, { parent: this, dependsOn: [this.argoCmPatch, this.rbacCmPatch] });

        this.appOfApps = new CustomResource(`${name}_app_of_apps`, {
            apiVersion: "argoproj.io/v1alpha1",
            kind: "Application",
            metadata: {
                name: "app-of-apps",
                namespace: ns,
            },
            spec: {
                project: "default",
                source: {
                    repoURL: args.appOfAppsRepo,
                    targetRevision: "HEAD",
                    path: ".",
                },
                destination: {
                    server: "https://kubernetes.default.svc",
                    namespace: ns,
                },
                syncPolicy: {
                    automated: {
                        prune: true,
                        selfHeal: true,
                    },
                    syncOptions: ["PrunePropagationPolicy=foreground", "PruneLast=true"],
                },
            },
        }, { parent: this, dependsOn: this.argoCD });

        this.registerOutputs({
            argoReleaseId: this.argoCD.id,
            argoIngressId: this.argoIngress.id,
        });
    }
}

export default ArgoCD;