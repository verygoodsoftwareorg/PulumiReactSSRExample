import * as shell from "shelljs"
import { LocalProgramArgs, LocalWorkspace } from "@pulumi/pulumi/automation";

const args = process.argv.slice(2);
let update = false;
if (args.length > 0 && args[0]) {
    update = args[0] === "up";
}

const run = async () => {
    shell.cd("../ui");
    shell.exec("yarn build");
    shell.mv("build", "../artifacts");

    shell.cd("../infra");

    const args: LocalProgramArgs = {
        stackName: "verygoodsoftware/dev",
        workDir: shell.pwd().toString()
    }

    const stack = await LocalWorkspace.createOrSelectStack(args);
    if(update){
        await stack.up({ onOutput: console.info})
    }
    else{
        await stack.preview({onOutput: console.info})
    }
}

run().catch(e => {
    console.error(e);
    process.exit(1);
})