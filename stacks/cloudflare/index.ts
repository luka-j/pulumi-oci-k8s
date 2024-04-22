import * as cloudflare from "@pulumi/cloudflare";
import {Config, all} from "@pulumi/pulumi";
import {IngressPatch} from "@pulumi/kubernetes/networking/v1";
import * as pulumi_kubernetes from "@pulumi/kubernetes";

const config = new Config();

const zones = cloudflare.getZonesOutput({
    filter: {
        name: config.require("domain"),
        status: "active",
    },
});


const dnsRecord = new cloudflare.Record("dns_record", {
    zoneId: zones.apply(zs => zs.zones[0].id!),
    name: config.get("subdomain") ? `*.${config.get("subdomain")}` : "*",
    value: config.require("ip"),
    type: "A",
    proxied: false,
});

if(config.get("annotateIngressWithCertManager")) {
    const kubernetesProvider = new pulumi_kubernetes.Provider("kubernetes_provider", {
        kubeconfig: config.require("kubeconfig"),
    });

    all([dnsRecord.urn]).apply(() => { // await cf dns record creation before triggering cert manager
        const ingressResourceName = config.require("annotateIngressWithCertManager");
        const ingressNameParts = ingressResourceName.split("/", 2);
        const ingressPatch = new IngressPatch("argo_ingress_patch", {
            metadata: {
                namespace: ingressNameParts[0],
                name: ingressNameParts[1],
                annotations: {
                    "cert-manager.io/cluster-issuer": config.require("certManagerIssuer"),
                    "pulumi.com/patchForce": "true",
                }
            },
        }, { provider: kubernetesProvider });
    });
}

export {dnsRecord}