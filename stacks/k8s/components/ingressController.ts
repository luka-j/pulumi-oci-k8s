import {ComponentResource, ComponentResourceOptions} from "@pulumi/pulumi";
import {Release} from "@pulumi/kubernetes/helm/v3/release";

class IngressController extends ComponentResource {
    public nginxIngress: Release;
    constructor(name: string, args: { version: string, cpuRequest: string, memoryRequest: string, maxReplicas: number },
                opts?: ComponentResourceOptions) {
        super("master:k8s:Ingress", name, args, opts);

        this.nginxIngress = new Release(`${name}_release`, {
            chart: "ingress-nginx",
            version: args.version,
            namespace: "ingress-nginx",
            createNamespace: true,
            name: "ingress-nginx",
            repositoryOpts: {
                repo: "https://kubernetes.github.io/ingress-nginx"
            },
            values: {
                controller: {
                    replicaCount: 2,
                    resources: {
                        requests: {
                            cpu: args.cpuRequest,
                            memory: args.memoryRequest
                        }
                    },
                    autoscaling: {
                        enabled: true,
                        minReplicas: 2,
                        maxReplicas: args.maxReplicas,
                        targetCPUUtilizationPercentage: 95,
                        targetMemoryUtilizationPercentage: 95
                    },
                    service: {
                        annotations: {
                            "oci.oraclecloud.com/load-balancer-type": "nlb"
                        }
                    },
                    metrics: {
                        enabled: true,
                        service: {
                            labels: {
                                monitoring: "IngressNginx"
                            }
                        }
                    }
                }
            }
        }, { parent: this });

        this.registerOutputs({
            ingressReleaseId: this.nginxIngress.id
        });
    }
}

export default IngressController;