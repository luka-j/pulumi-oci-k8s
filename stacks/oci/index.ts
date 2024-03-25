import KubernetesCluster from "./components/cluster";
import Vcn from "./components/vcn";
import {Config} from "@pulumi/pulumi";
import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";

const config = new Config();

const compartment = new oci.identity.Compartment("master", {
    name: "master",
    description: "master-test-compartment",
    enableDelete: true
});

const ads = pulumi.all([compartment.id]).apply(([id]) => {
    return oci.identity.getAvailabilityDomains({
        compartmentId: id,
    });
})

const vcn = new Vcn("network", {
    compartmentId: compartment.id,
    vcnName: "vcn",
    vcnRange: config.require("vcn_range"),
    publicSubnetRange: config.require("public_subnet_range"),
    privateSubnetRange: config.require("private_subnet_range")
});

const cluster = new KubernetesCluster("compute", {
    compartmentId: compartment.id,
    vcnId: vcn.vcn.id,
    privateSubnetId: vcn.privateSubnet.id,
    publicSubnetId: vcn.publicSubnet.id,
    availabilityDomainNames: ads.availabilityDomains
        .apply((ads) =>
            ads.map((ad) => ad.name)),
    kubernetesVersion: config.require("kubernetes_version"),
    podsIpRange: config.require("pods_ip_range"),
    servicesIpRange: config.require("services_ip_range"),
    nodePoolSize: config.requireNumber("oke_node_pool_size"),
    nodeShape: config.require("oke_node_shape"),
    nodeMemoryGbs: config.requireNumber("oke_node_memory_gbs"),
    nodeImageId: config.require("oke_node_image_id"),
    bastionHostShape: config.require("bastion_host_shape"),
    bastionHostImage: config.require("bastion_host_image_id"),
    bastionAuthorizedSshKey: config.require("public_ssh_key")
});

const clusterPrivateEndpointParts = cluster.okeCluster.endpoints[0].privateEndpoint.apply((t) => t.split(":"));

const bastionSession = new oci.bastion.Session("bastion_session", {
    bastionId: cluster.bastion.id,
    keyDetails: {
        publicKeyContent: config.require("public_ssh_key")
    },
    targetResourceDetails: {
        sessionType: "PORT_FORWARDING",
        targetResourcePrivateIpAddress: clusterPrivateEndpointParts.apply((p) => p[0]),
        targetResourcePort: clusterPrivateEndpointParts.apply((p) => parseInt(p[1])),
    },
    sessionTtlInSeconds: 60*60,
}, {
    deletedWith: cluster.bastion
});

// todo limits and alerts

export {
    compartment,
    vcn,
    cluster,
    bastionSession
}
