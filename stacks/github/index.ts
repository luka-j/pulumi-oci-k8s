import * as YAML from 'yaml';
import {Config} from "@pulumi/pulumi";
import * as fs from "fs";
import {Membership, Provider} from "@pulumi/github";
import TeamWithRepo from "./components/teamWithRepo";

const config = new Config();
const orgChartFile = fs.readFileSync(config.require("orgChartFile"));
const {org} = YAML.parse(orgChartFile.toString());

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


const teams : TeamWithRepo[] = [];
for(const team of org.teams) {
    const teamWithRepo = new TeamWithRepo(`gh_team_${team.name}`, {
        orgName: org.name,
        templateRepo: org.templateRepo,
        repoName: team.repo,
        repoDescription: team.repoDescription,
        teamName: team.name,
        teamMembers: team.members,
    }, { provider: provider });
    teams.push(teamWithRepo);
}

// todo edit ingress yamls in each repo

export {memberships, teams}