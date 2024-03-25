import * as cloudflare from "@pulumi/cloudflare";
import {Config, all} from "@pulumi/pulumi";
import {Ingress} from "@pulumi/kubernetes/networking/v1";

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
    proxied: true,
});

if(config.get("annotateIngressWithCertManager")) {
    all([dnsRecord.urn]).apply(() => { // await cf dns record creation before triggering cert manager
        const ingressResourceName = config.require("annotateIngressWithCertManager");
        const ingress = Ingress.get("existing_ingress", ingressResourceName);
        ingress.metadata.apply(metadata => {
            const annotations = {
                ...metadata.annotations,
                "cert-manager.io/cluster-issuer": config.require("certManagerIssuer")
            }
            return { ...metadata, annotations };
        });
    });
}

export {dnsRecord}