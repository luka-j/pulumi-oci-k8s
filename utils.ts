import * as child_process from "child_process";

export function plainLog(s: string) {
    process.stdout.write(s);
}

export function startSshTunnel(localPort: string, bastionSessionId: string, target: string) {
    console.log(`Establishing tunnel through [${bastionSessionId}] to [${target}] on port [${localPort}]...`);
    return child_process.spawn(
        "ssh", ["-N", "-L", `${localPort}:${target}`, `${bastionSessionId}@host.bastion.eu-frankfurt-1.oci.oraclecloud.com`] // todo other regions
    );
}

export function stopSshTunnel(tunnel: child_process.ChildProcessWithoutNullStreams | undefined) {
    if (tunnel === undefined) {
        return;
    }
    console.log("Stopping tunnel...");
    tunnel.kill();
}
