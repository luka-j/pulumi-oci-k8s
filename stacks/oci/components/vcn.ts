import * as oci from "@pulumi/oci";
import {ComponentResource, ComponentResourceOptions, Output} from "@pulumi/pulumi";

const ALL_IPS = "0.0.0.0/0";
const PROTO_TCP = "6";
const PROTO_ICMP = "1"
const PROTO_UDP = "17"


class Vcn extends ComponentResource {
    public vcn: oci.core.Vcn;
    public publicSubnet: oci.core.Subnet;
    public privateSubnet: oci.core.Subnet;
    private publicSecurityList: oci.core.SecurityList;
    private internetGateway: oci.core.InternetGateway;
    private publicRouteTable: oci.core.RouteTable;
    private privateSecurityList: oci.core.SecurityList;
    private natGateway: oci.core.NatGateway;
    private drg: oci.core.Drg;
    private drgAttachmentVcn: oci.core.DrgAttachment;
    private privateRouteTable: oci.core.RouteTable;


    constructor(name: string, args: { compartmentId: Output<string>, vcnName: string, vcnRange: string,
                    publicSubnetRange: string, privateSubnetRange: string },
                opts?: ComponentResourceOptions) {
        super("master:oci:Vcn", name, args, opts);

        this.vcn = new oci.core.Vcn(`${name}_vcn`, {
            compartmentId: args.compartmentId,
            displayName: args.vcnName,
            dnsLabel: args.vcnName,
            cidrBlocks: [args.vcnRange],
        }, { parent: this})
        this.publicSecurityList = new oci.core.SecurityList(`${name}_public_security_list`, {
            compartmentId: args.compartmentId,
            vcnId: this.vcn.id,
            displayName: `${args.vcnName}-sl-public`,

            egressSecurityRules: [{
                stateless: false,
                protocol: PROTO_TCP,
                destination: ALL_IPS,
                destinationType: "CIDR_BLOCK"
            }],

            ingressSecurityRules: [
                {
                    stateless: false,
                    protocol: PROTO_TCP,
                    source: ALL_IPS,
                    sourceType: "CIDR_BLOCK"
                },
                {
                    stateless: false,
                    protocol: PROTO_ICMP,
                    source: ALL_IPS,
                    sourceType: "CIDR_BLOCK",
                    icmpOptions: {
                        type: 3,
                        code: 4
                    }
                },
                {
                    stateless: false,
                    protocol: PROTO_ICMP,
                    source: args.vcnRange,
                    sourceType: "CIDR_BLOCK",
                    icmpOptions: {
                        type: 3
                    }
                },
                {
                    stateless: false,
                    protocol: '47',
                    source: ALL_IPS,
                    sourceType: "CIDR_BLOCK"
                }
            ]
        }, { parent: this});
        this.internetGateway = new oci.core.InternetGateway(`${name}_internet_gateway`, {
            compartmentId: args.compartmentId,
            vcnId: this.vcn.id,
            enabled: true,
            displayName: `${args.vcnName}-ig`,
        }, { parent: this});
        this.publicRouteTable  = new oci.core.RouteTable(`${name}_public_route_table`, {
            compartmentId: args.compartmentId,
            vcnId: this.vcn.id,
            displayName: `${args.vcnName}-public-rt`,
            routeRules: [{
                destination: ALL_IPS,
                destinationType: "CIDR_BLOCK",
                networkEntityId: this.internetGateway.id,
            }],
        }, { parent: this});
        this.publicSubnet = new oci.core.Subnet(`${name}_public_subnet`, {
            compartmentId: args.compartmentId,
            vcnId: this.vcn.id,
            displayName: args.vcnName + "-public-subnet",
            cidrBlock: args.publicSubnetRange,
            routeTableId: this.publicRouteTable.id,
            securityListIds: [this.publicSecurityList.id],
        }, { parent: this});
        this.privateSecurityList = new oci.core.SecurityList(`${name}_private_security_list`, {
            compartmentId: args.compartmentId,
            vcnId: this.vcn.id,
            displayName: `${args.vcnName}-sl-private`,

            egressSecurityRules: [{
                stateless: false,
                protocol: "all",
                destination: ALL_IPS,
                destinationType: "CIDR_BLOCK"
            }],

            ingressSecurityRules: [
                {
                    stateless: false,
                    protocol: PROTO_TCP,
                    source: args.vcnRange,
                    sourceType: "CIDR_BLOCK"
                },
                {
                    stateless: false,
                    protocol: PROTO_UDP,
                    source: args.vcnRange,
                    sourceType: "CIDR_BLOCK"
                },
                {
                    stateless: false,
                    protocol: PROTO_ICMP,
                    source: ALL_IPS,
                    sourceType: "CIDR_BLOCK",
                    icmpOptions: {
                        type: 3,
                        code: 4
                    }
                },
                {
                    stateless: false,
                    protocol: PROTO_ICMP,
                    source: args.vcnRange,
                    sourceType: "CIDR_BLOCK",
                    icmpOptions: {
                        type: 3
                    }
                },
            ]
        }, { parent: this});
        this.natGateway = new oci.core.NatGateway(`${name}_internet_gateway`, {
            compartmentId: args.compartmentId,
            vcnId: this.vcn.id,
            displayName: `${args.vcnName}-ng`,
        }, { parent: this});
        this.drg = new oci.core.Drg(`${name}_drg`, {
            compartmentId: args.compartmentId,
        }, { parent: this});
        this.drgAttachmentVcn = new oci.core.DrgAttachment(`${name}_drg_attachment_vcn`, {
            drgId: this.drg.id,
            networkDetails: {
                id: this.vcn.id,
                type: "VCN",
            },
        }, { parent: this});
        this.privateRouteTable = new oci.core.RouteTable(`${name}_private_route_table`, {
            compartmentId: args.compartmentId,
            vcnId: this.vcn.id,
            displayName: `${args.vcnName}-private-rt`,
            routeRules: [{
                destination: ALL_IPS,
                destinationType: "CIDR_BLOCK",
                networkEntityId: this.natGateway.id,
            }, {
                destination: args.vcnRange,
                destinationType: "CIDR_BLOCK",
                networkEntityId: this.drg.id,
            }],
        }, { parent: this});
        this.privateSubnet = new oci.core.Subnet("private_subnet", {
            compartmentId: args.compartmentId,
            vcnId: this.vcn.id,
            displayName: `${args.vcnName}-private-subnet`,
            cidrBlock: args.privateSubnetRange,
            routeTableId: this.privateRouteTable.id,
            securityListIds: [this.privateSecurityList.id],
        }, { parent: this});


        this.registerOutputs({
            vcnId: this.vcn.id,
            publicSubnetId: this.publicSubnet.id,
            privateSubnetId: this.privateSubnet.id
        });
    }
}

export default Vcn;