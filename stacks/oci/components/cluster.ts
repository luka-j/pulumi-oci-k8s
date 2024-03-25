import * as oci from "@pulumi/oci";

import {ComponentResource, ComponentResourceOptions, Output} from "@pulumi/pulumi";
import {GetClusterKubeConfigResult} from "@pulumi/oci/containerengine";

class KubernetesCluster extends ComponentResource {
    public okeCluster: oci.containerengine.Cluster;
    private okeNodePool: oci.containerengine.NodePool;
    public bastion: oci.bastion.Bastion;

    constructor(name: string, args: { compartmentId: Output<string>, vcnId: Output<string>,
                    privateSubnetId: Output<string>, publicSubnetId: Output<string>, availabilityDomainNames: Output<string[]>,
                    kubernetesVersion: string, podsIpRange: string, servicesIpRange: string, nodePoolSize: number,
                    nodeShape: string, nodeMemoryGbs: number, nodeImageId: string, bastionHostShape: string,
                    bastionHostImage: string, bastionAuthorizedSshKey: string},
                opts?: ComponentResourceOptions) {
        super("master:oci:KubernetesCluster", name, args, opts);

        this.okeCluster = new oci.containerengine.Cluster(`${name}_oke_cluster`, {
            compartmentId: args.compartmentId,
            kubernetesVersion: args.kubernetesVersion,
            vcnId: args.vcnId,
            endpointConfig: {
                isPublicIpEnabled: false,
                subnetId: args.privateSubnetId,
            },
            options: {
                addOns: {
                    isKubernetesDashboardEnabled: false,
                    isTillerEnabled: false,
                },
                kubernetesNetworkConfig: {
                    podsCidr: args.podsIpRange,
                    servicesCidr: args.servicesIpRange
                },
                serviceLbSubnetIds: [args.publicSubnetId],
            },
        }, { parent: this });
        this.okeNodePool = new oci.containerengine.NodePool(`${name}_oke_node_pool`, {
            compartmentId: args.compartmentId,
            clusterId: this.okeCluster.id,
            kubernetesVersion: args.kubernetesVersion,
            nodeConfigDetails: {
                size: args.nodePoolSize,
                placementConfigs: [
                    {
                        availabilityDomain: args.availabilityDomainNames[0],
                        subnetId: args.privateSubnetId,
                    },
                    {
                        availabilityDomain: args.availabilityDomainNames[1],
                        subnetId: args.privateSubnetId,
                    },
                ]
            },
            nodeShape: args.nodeShape,
            nodeShapeConfig: {
                memoryInGbs: args.nodeMemoryGbs,
                ocpus: 1,
            },

            nodeSourceDetails: {
                imageId: args.nodeImageId,
                sourceType: "image",
                bootVolumeSizeInGbs: "50",
            },

            initialNodeLabels: [
                {
                    key: "name",
                    value: "oke_node_pool"
                }
            ]
        }, { parent: this });

        this.bastion = new oci.bastion.Bastion("bastion", {
            bastionType: "STANDARD",
            compartmentId: args.compartmentId,
            targetSubnetId: args.publicSubnetId,
            clientCidrBlockAllowLists: ["0.0.0.0/0"] // todo use this machine's IP
        }, { parent: this });

        this.registerOutputs({
            clusterId: this.okeCluster.id,
            bastionId: this.bastion.id,
            clusterPrivateIp: this.okeCluster.endpoints[0].privateEndpoint
        });
    }
}

export default KubernetesCluster;