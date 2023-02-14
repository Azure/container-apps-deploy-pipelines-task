import * as tl from 'azure-pipelines-task-lib/task';
import { Utility } from './Utility';

const ORYX_CLI_IMAGE: string = "mcr.microsoft.com/oryx/cli:debian-buster-20230207.2";

export class TelemetryHelper {
    readonly disableTelemetry: boolean = false;

    private scenario: string;
    private result: string;
    private taskStartMilliseconds: number;

    constructor(disableTelemetry: boolean) {
        this.disableTelemetry = disableTelemetry;
        this.scenario = "N/A";
        this.result = "failed";
        this.taskStartMilliseconds = Date.now();
    }

    /**
     * Sets the tracked result property to "succeeded".
     */
    public setSuccessfulResult() {
        this.result = "succeeded";
    }

    /**
     * Sets the tracked scenario property to "used-builder".
     */
    public setBuilderScenario() {
        this.scenario = "used-builder";
    }

    /**
     * Sets the tracked scenario property to "used-dockerfile".
     */
    public setDockerfileScenario() {
        this.scenario = "used-dockerfile";
    }

    /**
     * Sets the tracked scenario property to "used-image".
     */
    public setImageScenario() {
        this.scenario = "used-image";
    }

    /**
     * If telemetry is enabled, uses the "oryx telemetry" command to log metadata about this task execution.
     */
    public log() {
        const taskLengthMilliseconds = Date.now() - this.taskStartMilliseconds;
        if (!this.disableTelemetry) {
            tl.debug(`Telemetry enabled; logging metadata about task result, length and scenario targeted.`);
            try {
                const dockerCommand = `run --rm ${ORYX_CLI_IMAGE} /bin/bash -c "oryx telemetry --event-name 'ContainerAppsPipelinesTaskRC' ` +
                `--processing-time '${taskLengthMilliseconds}' --property 'result=${this.result}' --property 'scenario=${this.scenario}'"`
                new Utility().throwIfError(
                    tl.execSync('docker', dockerCommand)
                );
            } catch (err) {
                tl.error(tl.loc('LogTelemetryFailed'));
                throw err;
            }
        }
    }
}