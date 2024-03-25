import {ComponentResource, ComponentResourceOptions} from "@pulumi/pulumi";
import {Repository, Team, TeamMembers, TeamRepository} from "@pulumi/github";

class TeamWithRepo extends ComponentResource {
    private repo : Repository;
    private team : Team;
    private teamMembers : TeamMembers;
    private teamRepo : TeamRepository;


    constructor(name: string, args: { orgName: string, templateRepo: string, repoName: string, repoDescription: string,
                    teamName: string, teamMembers: string[]},
                opts?: ComponentResourceOptions) {
        super("master:gh:TeamWithRepo", name, args, opts);

        this.repo = new Repository(`${name}_repo`, {
            name: args.repoName,
            description: args.repoDescription,
            hasIssues: true,
            hasWiki: true,
            visibility: "public",
            template: {
                owner: args.orgName,
                repository: args.templateRepo,
            }
        }, { parent: this });

        this.team = new Team(`${name}_ team`, {
            name: args.teamName,
            privacy: "closed",
        }, { parent: this });

        this.teamMembers = new TeamMembers(`${name}_team_members`, {
            teamId: this.team.id,
            members: args.teamMembers.map((value) => {return {username: value}}),
        }, { parent: this });

        this.teamRepo = new TeamRepository(`${name}_team_repo`, {
            teamId: this.team.id,
            repository: this.repo.name,
            permission: "push",
        }, { parent: this });

        this.registerOutputs({
            repoId: this.repo.id,
            teamId: this.team.id,
            teamMembersId: this.teamMembers.id,
            teamRepoId: this.teamRepo.id,
        })
    }
}

export default TeamWithRepo;