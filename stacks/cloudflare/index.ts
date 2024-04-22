import * as cloudflare from "@pulumi/cloudflare";
import {Config, all} from "@pulumi/pulumi";
import {IngressPatch} from "@pulumi/kubernetes/networking/v1";
import * as pulumi_kubernetes from "@pulumi/kubernetes";

const config = new Config();

const domain = config.require("domain");
const zones = cloudflare.getZonesOutput({
    filter: {
        name: domain,
        status: "active",
    },
});

const dnsRecordName = config.get("subdomain") ? `*.${config.get("subdomain")}` : "*";
const dnsRecord = new cloudflare.Record("dns_record", {
    zoneId: zones.apply(zs => zs.zones[0].id!),
    name: dnsRecordName,
    value: config.require("ip"),
    type: "A",
    proxied: false,
});

const ruleSslOff = new cloudflare.PageRule("page_rule_ssl_off", {
    zoneId: zones.apply(zs => zs.zones[0].id!),
    target: `${dnsRecordName}.${domain}/*`,
    priority: 1,
    actions: {
        ssl: "off",
    },
});

if(config.get("annotateIngressWithCertManager")) {
    const kubernetesProvider = new pulumi_kubernetes.Provider("kubernetes_provider", {
        kubeconfig: config.require("kubeconfig"),
    });

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
    }, { provider: kubernetesProvider, dependsOn: dnsRecord });
}

export {dnsRecord, ruleSslOff}