import {ComponentResource, ComponentResourceOptions} from "@pulumi/pulumi";
import {Release} from "@pulumi/kubernetes/helm/v3/release";
import {CustomResource} from "@pulumi/kubernetes/apiextensions";

class CertManager extends ComponentResource {
    public certManager: Release;
    public clusterIssuer: CustomResource;

    constructor(name: string, args: { version: string, acmeEmail: string },
                opts?: ComponentResourceOptions) {
        super("master:k8s:CertManager", name, args, opts);

        this.certManager = new Release(`${name}_release`, {
            chart: "cert-manager",
            version: args.version,
            namespace: "cert-manager",
            createNamespace: true,
            name: "cert-manager",
            repositoryOpts: {
                repo: "https://charts.jetstack.io"
            },
            values: {
                installCRDs: true
            },
        }, { parent: this });

        this.clusterIssuer = new CustomResource(`${name}_cluster_issuer`, {
            apiVersion: "cert-manager.io/v1",
            kind: "ClusterIssuer",
            metadata: {
                name: "letsencrypt-prod",
                namespace: "cert-manager",
            },
            spec: {
                acme: {
                    server: "https://acme-v02.api.letsencrypt.org/directory",
                    email: args.acmeEmail,
                    privateKeySecretRef: {
                        name: "letsencrypt-prod"
                    },
                    solvers: [
                        {
                            http01: {
                                ingress: {
                                    "class": "nginx"
                                }
                            }
                        }
                    ]
                }
            }
        }, { parent: this, dependsOn: this.certManager });

        this.registerOutputs({
            certManagerReleaseId: this.certManager.id,
            clusterIssuerResourceId: this.clusterIssuer.id,
        });
    }
}

export default CertManager;