import Vcn from "./components/vcn";
import KubernetesCluster from "./components/cluster";
import Budget from "./components/budget";
import {Config} from "@pulumi/pulumi";
import * as oci from "@pulumi/oci";

const config = new Config();

const compartment = new oci.identity.Compartment("master", {
    name: config.require("compartmentName"),
    description: config.require("compartmentDescription"),
    enableDelete: true
});

const ads = compartment.id.apply(id =>
    oci.identity.getAvailabilityDomains({
        compartmentId: id
    })
);

const budget = new Budget("budget_one", {
    tenancyId: config.requireSecret("tenancyId"),
    compartmentId: compartment.id,
    amount: 1,
    description: "Ensure (almost) nothing is spent",
    displayName: "master-low-budget",
    rules: [{
        threshold: 0.01,
        thresholdType: "ABSOLUTE",
        type: "ACTUAL",
        message: "Spending occurred!"
    }, {
        threshold: 95,
        thresholdType: "PERCENTAGE",
        type: "FORECAST",
        message: "On track to spend whole budget"
    }],
});

const vcn = new Vcn("network", {
    compartmentId: compartment.id,
    vcnName: "vcn",
    vcnRange: config.require("vcnRange"),
    publicSubnetRange: config.require("publicSubnetRange"),
    privateSubnetRange: config.require("privateSubnetRange")
});

const cluster = new KubernetesCluster("compute", {
    compartmentId: compartment.id,
    vcnId: vcn.vcn.id,
    privateSubnetId: vcn.privateSubnet.id,
    publicSubnetId: vcn.publicSubnet.id,
    availabilityDomainNames: ads.availabilityDomains
        .apply((ads) =>
            ads.map((ad) => ad.name)),
    kubernetesVersion: config.require("kubernetesVersion"),
    podsIpRange: config.require("podsIpRange"),
    servicesIpRange: config.require("servicesIpRange"),
    nodePoolSize: config.requireNumber("okeNodePoolSize"),
    nodeShape: config.require("okeNodeShape"),
    nodeMemoryGbs: config.requireNumber("okeNodeMemoryGbs"),
    nodeImageId: config.require("okeNodeImageId"),
    bastionHostShape: config.require("bastionHostShape"),
    bastionHostImage: config.require("bastionHostImageId"),
    bastionAuthorizedSshKey: config.require("publicSshKey")
});

const clusterPrivateEndpointParts = cluster.okeCluster.endpoints[0].privateEndpoint.apply((t) => t.split(":"));

const bastionSession = new oci.bastion.Session("bastion_session", {
    bastionId: cluster.bastion.id,
    keyDetails: {
        publicKeyContent: config.require("publicSshKey")
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

export {
    compartment,
    budget,
    vcn,
    cluster,
    bastionSession
}
