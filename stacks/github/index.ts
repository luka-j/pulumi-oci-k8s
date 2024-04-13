import * as YAML from 'yaml';
import {Config} from "@pulumi/pulumi";
import * as fs from "fs";
import {Membership, Provider, Repository} from "@pulumi/github";
import TeamWithRepo from "./components/teamWithRepo";
import {editIngressDefs, populateArgoAppRepo} from "./utils";
import * as pulumi from "@pulumi/pulumi";

const config = new Config();
const orgChartFile = fs.readFileSync(config.require("orgChartFile"));
const {org} = YAML.parse(orgChartFile.toString());
const projectHost = config.require("host");

const provider = new Provider("gh_provider", {
    token: config.requireSecret("githubToken"),
    owner: org.name,
});


const usersList : string[] = org.teams.map((t: any) => t.members).flat();
const users = new Set(usersList);
const memberships : Membership[] = [];
for(const user of users) {
    const membership = new Membership(`gh_membership_${user}`, {
        username: user
    }, { provider: provider });
    memberships.push(membership);
}

const argoAppOfAppsRepo = new Repository(`gh_aoa_repo`, {
    name: "argo-app-of-apps",
    description: "App definitions for ArgoCD",
    visibility: "public",
}, { provider: provider });

const teams : TeamWithRepo[] = [];
for(const team of org.teams) {
    const teamWithRepo = new TeamWithRepo(`gh_team_${team.name}`, {
        orgName: org.name,
        templateRepo: org.templateRepo,
        repoName: team.repo,
        repoDescription: team.repoDescription,
        teamName: team.name,
        teamMembers: team.members,
    }, { provider: provider, dependsOn: argoAppOfAppsRepo });
    teams.push(teamWithRepo);
}

// pulumi.github.Repository is very eagerly populated and invoking apply() on it is pretty much useless
// (everything is known at preview time); Teams on the other hand are not, and their etag is only known after creating them
// so this is a 'hack' to make code execute only after everything is created. (note that teams dependsOn aoa repo)

pulumi.all(teams.map(t=>t.team.etag)).apply(() => {
    teams.map(team => {
        team.repo.sshCloneUrl.apply(sshCloneUrl => {
            editIngressDefs(sshCloneUrl, `template.${projectHost}`,
                `${team.repoName}.${projectHost}`);
        })
    });

    argoAppOfAppsRepo.sshCloneUrl.apply(aoaRepoSshUrl => {
        pulumi.all(teams.map(team => team.repo.httpCloneUrl))
            .apply(repoUrls => {
                const repoNames = teams.map(t => t.repoName);
                populateArgoAppRepo(aoaRepoSshUrl, repoNames, repoUrls);
            });
    });
})

export {org, memberships, teams, argoAppOfAppsRepo}