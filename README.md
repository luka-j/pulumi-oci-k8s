# OCI Kubernetes infrastructure in Pulumi

This repository hosts a Node.js/Typescript program which utilizes Pulumi and 
[Automation API](https://www.pulumi.com/automation/) to set up  a Kubernetes cluster on Oracle Cloud Infrastructure (OCI), 
set up nginx-ingress, cert-manager and ArgoCD in Kubernetes, create a DNS record and required rules in Cloudflare, as 
well as initialize up GitHub repositories with seed projects for multiple teams if required.

## Project structure
`pulumi.ts` is the main file, importing functions from `utils.ts`. In `stacks/` folder there are four Pulumi programs
for each of the different providers (GitHub, OCI, Kubernetes, Cloudflare). Each of these can be managed conventionally
using `pulumi` CLI. These programs all use differently named stacks, but default configuration is provided for one stack
in each. 

## Usage
Ensure you have accounts and API access to OCI, GitHub and Cloudflare. `oci` CLI should be configured to access with
the appropriate user; this config will be automatically used. Cloudflare token with permissions to edit DNS records and
page rules should be set as a secret `cloudflare:apiToken` in `stacks/cloudflare/Pulumi.cf_dev.yaml`. GitHub token with
permissions to manage organizations (or at least the one which should be used) should be as a secret `master:githubToken`
in `stacks/github/Pulumi.gh_dev.yaml`. Passphrase used for Pulumi password encryption should be written to 
`pulumi_passphrase` file in root directory of this project. `org-chart.yaml` should be edited to reflect actual org 
name, projects and GitHub usernames of developers to be added to the org.

After reviewing stacks' configuration, run `pulumi.ts up` with your favourite command for TypeScript Node projects.
If you want to destroy all infrastructure, including GitHub repos and org memberships, run `pulumi.ts destroyAll`; 
if you want to keep GitHub repos and org memberships (but destroy everything else), run `pulumi.ts destroy`.