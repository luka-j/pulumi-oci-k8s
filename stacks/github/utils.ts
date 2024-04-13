import simpleGit from "simple-git";
import * as fs from "fs";


export async function editIngressDefs(repoPath: string, templateHost: string, appHost: string) {
    const tmpDir = "repo-tmp-" + Date.now();
    fs.mkdirSync(tmpDir);
    await simpleGit().clone(repoPath, tmpDir);
    const ingressDef = tmpDir + "/k8s-resources/ingress.yaml";
    await replaceInFile(ingressDef, new RegExp(templateHost, "g"), appHost);
    const sg = simpleGit(tmpDir);
    await sg.commit("Edit ingress resource", {"--all": null});
    await sg.push();
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 500 });
}

export async function populateArgoAppRepo(repoPath: string, appNames: string[], appCloneUrls: string[]) {
    const appOfAppsDir = "argo-app-of-apps";
    fs.rmSync(appOfAppsDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 500 });
    fs.mkdirSync(appOfAppsDir);
    await simpleGit().clone(repoPath, appOfAppsDir);

    const sg = simpleGit(appOfAppsDir);
    const appInfo = zip(appNames, appCloneUrls);
    for (const app of appInfo) {
        const appFileName = `${app[0]}-app.yaml`;
        const appFilePath = `${appOfAppsDir}/${appFileName}`;
        fs.cpSync("argo-app-template.yaml", appFilePath);
        await replaceInFile(appFilePath, /\${APP_NAME}/g, app[0]);
        await replaceInFile(appFilePath, /\${REPO_CLONE_URL}/g, app[1]);
        await sg.add(appFileName);
    }

    await sg.commit("Set up Argo app of apps repo", {"--all": null});
    await sg.push();
    fs.rmSync(appOfAppsDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 500 });
}

async function replaceInFile(filename: string, str: RegExp, replacement: string) {
    const content = await fs.promises.readFile(filename, "utf-8");
    const replaced = content.replace(str, replacement);
    await fs.promises.writeFile(filename, replaced, "utf-8");
}

const zip = (a: any, b: any) => a.map((k: any, i: number) => [k, b[i]]);
