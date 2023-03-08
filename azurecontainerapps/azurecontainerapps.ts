import * as fs from 'fs';
import * as path from 'path';
import * as tl from 'azure-pipelines-task-lib/task';
import { AzureAuthenticationHelper } from './src/AzureAuthenticationHelper';
import { ContainerAppHelper } from './src/ContainerAppHelper';
import { ContainerRegistryHelper } from './src/ContainerRegistryHelper';
import { TelemetryHelper } from './src/TelemetryHelper';
import { Utility } from './src/Utility';

const util = new Utility();

export class azurecontainerapps {

    public static async runMain(): Promise<void> {
        let disableTelemetry = tl.getBoolInput('disableTelemetry', false);

        // Set up TelemetryHelper for managing telemetry calls
        const telemetryHelper: TelemetryHelper = new TelemetryHelper(disableTelemetry);

        // Set up AzureAuthenticationHelper for managing logging in and out of Azure CLI using provided service connection
        const authHelper: AzureAuthenticationHelper = new AzureAuthenticationHelper();

        // Set up ContainerAppHelper for managing calls around the Container App
        const appHelper: ContainerAppHelper = new ContainerAppHelper(disableTelemetry);
        try {
            // Set up localization
            tl.setResourcePath(path.join(__dirname, 'task.json'));

            const cwd: string = tl.getPathInput('cwd', true, false);
            tl.mkdirP(cwd);
            tl.cd(cwd);

            // Set build variables used later for default values
            const buildId = tl.getVariable('Build.BuildId');
            const buildNumber = tl.getVariable('Build.BuildNumber');

            // Set up array to store optional arguments for the 'az containerapp up' command
            const optionalCmdArgs: string[] = [];

            // Get the path to the application source to build and run, if provided
            const appSourcePath: string = tl.getInput('appSourcePath', false);

            // Get the name of the ACR instance to push images to, if provided
            const acrName: string = tl.getInput('acrName', false);

            // Get the previously built image to deploy, if provided
            let imageToDeploy: string = tl.getInput('imageToDeploy', false);

            // Get the YAML configuration file, if provided
            let yamlConfigPath: string = tl.getInput('yamlConfigPath', false);

            // Ensure that acrName is also provided if appSourcePath is provided
            if (!util.isNullOrEmpty(appSourcePath) && util.isNullOrEmpty(acrName)) {
                tl.error(tl.loc('MissingAcrNameMessage'));
                throw Error(tl.loc('MissingAcrNameMessage'));
            }

            // Ensure that one of appSourcePath, imageToDeploy, or yamlConfigPath is provided
            if (util.isNullOrEmpty(appSourcePath) && util.isNullOrEmpty(imageToDeploy) && util.isNullOrEmpty(yamlConfigPath)) {
                tl.error(tl.loc('MissingRequiredArgumentMessage'));
                throw Error(tl.loc('MissingRequiredArgumentMessage'));
            }

            // Signals whether or not only the YAML configuration file should be provided to the 'az containerapp' command
            let shouldOnlyUseYaml: boolean = false;

            // Use only the YAML configuration file if it was provided and the other required arguments were not
            if (!util.isNullOrEmpty(yamlConfigPath) && util.isNullOrEmpty(appSourcePath) && util.isNullOrEmpty(imageToDeploy)) {
                shouldOnlyUseYaml = true;
            }

            // Track whether or not Container App properties should be pulled from the provided YAML configuration file
            let shouldUseYamlProperties: boolean = false;
            if (!util.isNullOrEmpty(yamlConfigPath))
            {
                shouldUseYamlProperties = true;
            }

            // Signals whether the Oryx builder should be used to create a runnable application image
            let shouldUseBuilder: boolean = false;

            // Signals whether an image will be created locally and pushed to ACR to use for the Container App
            let shouldBuildAndPushImage = !util.isNullOrEmpty(appSourcePath);

            // Get Dockerfile to build, if provided, or check if one exists at the root of the provided application
            let dockerfilePath: string = tl.getInput('dockerfilePath', false);
            if (shouldBuildAndPushImage) {
                if (util.isNullOrEmpty(dockerfilePath)) {
                    console.log(tl.loc('CheckForAppSourceDockerfileMessage', appSourcePath));
                    const rootDockerfilePath = path.join(appSourcePath, 'Dockerfile');
                    if (fs.existsSync(rootDockerfilePath)) {
                        console.log(tl.loc('FoundAppSourceDockerfileMessage', rootDockerfilePath));
                        dockerfilePath = rootDockerfilePath;
                    } else {
                        // No Dockerfile found or provided, use the builder
                        shouldUseBuilder = true;
                    }
                } else {
                    dockerfilePath = path.join(appSourcePath, dockerfilePath);
                }
            }

            // Install the pack CLI if the Oryx builder is being used
            if (shouldUseBuilder) {
                await appHelper.installPackCliAsync();
            }

            // Set the Azure CLI to dynamically install missing extensions
            util.setAzureCliDynamicInstall();

            // Log in to Azure with the service connection provided
            const connectedService: string = tl.getInput('connectedServiceNameARM', true);
            authHelper.loginAzureRM(connectedService);

            const acrUsername: string = tl.getInput('acrUsername', false);
            const acrPassword: string = tl.getInput('acrPassword', false);

            // Login to ACR if credentials were provided
            // Note: this step should be skipped if we're ONLY using the YAML configuration file (no image to build/push/pull)
            if (!shouldOnlyUseYaml && !util.isNullOrEmpty(acrName) && !util.isNullOrEmpty(acrUsername) && !util.isNullOrEmpty(acrPassword)) {
                console.log(tl.loc('AcrUsernamePasswordLoginMessage'));
                new ContainerRegistryHelper().loginAcrWithUsernamePassword(acrName, acrUsername, acrPassword);
            }

            // Login to ACR with access token if complete credentials were not provided
            // Note: this step should be skipped if we're ONLY using the YAML configuration file (no image to build/push/pull)
            if (!shouldOnlyUseYaml && !util.isNullOrEmpty(acrName) && (util.isNullOrEmpty(acrUsername) || util.isNullOrEmpty(acrPassword))) {
                console.log(tl.loc('AcrAccessTokenLoginMessage'));
                await new ContainerRegistryHelper().loginAcrWithAccessTokenAsync(acrName);
            }

            // Get the name of the image to build if it was provided, or generate it from build variables
            // Note: this step should be skipped if we're ONLY using the YAML configuration file (no image to build/push/pull)
            let imageToBuild: string = tl.getInput('imageToBuild', false);
            if (!shouldOnlyUseYaml && util.isNullOrEmpty(imageToBuild)) {
                imageToBuild = `${acrName}.azurecr.io/ado-task/container-app:${buildId}.${buildNumber}`;
                console.log(tl.loc('DefaultImageToBuildMessage', imageToBuild));
            }

            // Get the name of the image to deploy if it was provided, or set it to the value of 'imageToBuild'
            // Note: this step should be skipped if we're ONLY using the YAML configuration file (no image to build/push/pull)
            if (!shouldOnlyUseYaml && util.isNullOrEmpty(imageToDeploy)) {
                imageToDeploy = imageToBuild;
                console.log(tl.loc('DefaultImageToDeployMessage', imageToDeploy));
            }

            // Get the Container App name if it was provided, or generate it from build variables
            let containerAppName: string = tl.getInput('containerAppName', false);
            if (util.isNullOrEmpty(containerAppName)) {
                containerAppName = `ado-task-app-${buildId}-${buildNumber}`;
                console.log(tl.loc('DefaultContainerAppNameMessage', containerAppName));
            }

            // Get the resource group to deploy to if it was provided, or generate it from the Container App name
            let resourceGroup: string = tl.getInput('resourceGroup', false);
            if (util.isNullOrEmpty(resourceGroup)) {
                resourceGroup = `${containerAppName}-rg`;
                console.log(tl.loc('DefaultResourceGroupMessage', resourceGroup));
            }

            // Set Container App environment deployment location, if provided
            let location: string = tl.getInput('location', false);

            // Ensure that the resource group that the Container App will be created in exists
            const resourceGroupExists = await appHelper.doesResourceGroupExist(resourceGroup);
            if (!resourceGroupExists) {
                // If no location was provided, get the default location for the Container App provider
                if (util.isNullOrEmpty(location)) {
                    location = await appHelper.getDefaultContainerAppLocation();
                }

                await appHelper.createResourceGroup(resourceGroup, location);
            }

            // Determine if the Container App currently exists
            const containerAppExists: boolean = await appHelper.doesContainerAppExist(containerAppName, resourceGroup);

            // Pass the ACR credentials when creating a Container App that doesn't use the YAML file
            if (!containerAppExists && !shouldOnlyUseYaml) {
                optionalCmdArgs.push(
                    `--registry-server ${acrName}.azurecr.io`,
                    `--registry-username ${acrUsername}`,
                    `--registry-password ${acrPassword}`);
            }

            // Get the Container App environment if it was provided
            let containerAppEnvironment: string = tl.getInput('containerAppEnvironment', false);

            // See if we can reuse an existing Container App environment found in the resource group
            // Note: this step should be skipped if we're using properties from the YAML configuration file (YAML uses existing environment)
            let discoveredExistingEnvironment = false;
            if (!containerAppExists && !shouldUseYamlProperties && util.isNullOrEmpty(containerAppEnvironment)) {
                const existingContainerAppEnvironment: string = await appHelper.getExistingContainerAppEnvironment(resourceGroup);
                if (!util.isNullOrEmpty(existingContainerAppEnvironment)) {
                    discoveredExistingEnvironment = true;
                    containerAppEnvironment = existingContainerAppEnvironment;
                    console.log(tl.loc('ExistingContainerAppEnvironmentMessage', containerAppEnvironment));
                }
            }

            // Generate the Container App environment name if it was not provided
            // Note: this step should be skipped if we're using properties from the YAML configuration file (YAML uses existing environment)
            if (util.isNullOrEmpty(containerAppEnvironment) && !shouldUseYamlProperties) {
                containerAppEnvironment = `${containerAppName}-env`;
                console.log(tl.loc('DefaultContainerAppEnvironmentMessage', containerAppEnvironment));
            }

            // Determine if the Container App environment currently exists and create one if it doesn't
            // Note: this step should be skipped if we're using properties from the YAML configuration file (YAML uses existing environment)
            if (!containerAppExists && !discoveredExistingEnvironment && !shouldUseYamlProperties) {
                const containerAppEnvironmentExists: boolean = await appHelper.doesContainerAppEnvironmentExist(containerAppEnvironment, resourceGroup);
                if (!containerAppEnvironmentExists) {
                    await appHelper.createContainerAppEnvironment(containerAppEnvironment, resourceGroup, location);
                }
            }

            // Get the runtime stack if provided, or determine it using Oryx
            let runtimeStack: string = tl.getInput('runtimeStack', false);
            if (util.isNullOrEmpty(runtimeStack) && shouldUseBuilder) {
                runtimeStack = await appHelper.determineRuntimeStackAsync(appSourcePath);
                console.log(tl.loc('DefaultRuntimeStackMessage', runtimeStack));
            }

            // Get the ingress value if it was provided
            let ingress: string = tl.getInput('ingress', false);
            let ingressEnabled: boolean = true;

            // Set the ingress value to 'external' if it was not provided
            // Note: this step should be skipped if we're using properties from the YAML configuration file (YAML defines ingress)
            if (util.isNullOrEmpty(ingress) && !shouldUseYamlProperties) {
                ingress = 'external';
                console.log(tl.loc('DefaultIngressMessage', ingress));
            }

            // Set the value of ingressEnabled to 'false' if ingress was provided as 'disabled'
            // Note: this step should be skipped if we're using properties from the YAML configuration file (YAML defines ingress)
            if (ingress == 'disabled' && !shouldUseYamlProperties) {
                ingressEnabled = false;
                console.log(tl.loc('DisabledIngressMessage'));
            }

            // Add the ingress value to the optional arguments array, if not disabled
            // Note: this step should be skipped if we're using properties from the YAML configuration file (YAML defines ingress)
            // Note: this step should be skipped if we're updating an existing Container App (ingress is enabled via a separate command)
            if (ingressEnabled && !containerAppExists && !shouldUseYamlProperties) {
                optionalCmdArgs.push(`--ingress ${ingress}`);
            }

            // Get the target port if provided, or determine it based on the application type
            let targetPort: string = tl.getInput('targetPort', false);
            if (ingressEnabled && util.isNullOrEmpty(targetPort) && shouldUseBuilder) {
                if (!util.isNullOrEmpty(runtimeStack) && runtimeStack.startsWith('python:')) {
                    targetPort = '80';
                } else {
                    targetPort = '8080';
                }

                console.log(tl.loc('DefaultTargetPortMessage', targetPort));
            }

            // Set the target port to 80 if it was not provided or determined
            // Note: this step should be skipped if we're using properties from the YAML configuration file (YAML defines target port with ingress)
            if (ingressEnabled && util.isNullOrEmpty(targetPort) && !shouldUseYamlProperties) {
                targetPort = '80';
                console.log(tl.loc('DefaultTargetPortMessage', targetPort));
            }

            // Add the target port to the optional arguments array
            // Note: this step should be skipped if we're using properties from the YAML configuration file (YAML defines target port with ingress)
            // Note: this step should be skipped if we're updating an existing Container App (ingress is enabled via a separate command)
            if (ingressEnabled && !util.isNullOrEmpty(targetPort) && !containerAppExists && !shouldUseYamlProperties) {
                optionalCmdArgs.push(`--target-port ${targetPort}`);
            }

            const environmentVariables: string = tl.getInput('environmentVariables', false);

            // Add user specified environment variables for create scenario
            // Note: this step should be skipped if we're using properties from the YAML configuration file (YAML defines environment variables)
            if (!util.isNullOrEmpty(environmentVariables) && !containerAppExists && !shouldUseYamlProperties) {
                optionalCmdArgs.push(`--env-vars ${environmentVariables}`);
            }

            // Add user specified environment variables for update scenario
            // Note: this step should be skipped if we're using properties from the YAML configuration file (YAML defines environment variables)
            if (!util.isNullOrEmpty(environmentVariables) && containerAppExists && !shouldUseYamlProperties) {
                optionalCmdArgs.push(`--replace-env-vars ${environmentVariables}`);
            }

            // If using the Oryx++ Builder to produce an image, create a runnable application image
            if (shouldUseBuilder) {
                console.log(tl.loc('CreateImageWithBuilderMessage'));

                // Set the Oryx++ Builder as the default builder locally
                appHelper.setDefaultBuilder();

                // Create a runnable application image
                appHelper.createRunnableAppImage(imageToDeploy, appSourcePath, runtimeStack);

                // If telemetry is enabled, log that the builder scenario was targeted for this task
                telemetryHelper.setBuilderScenario();
            }

            // If a Dockerfile was found or provided, create a runnable application image from that
            if (!util.isNullOrEmpty(dockerfilePath) && shouldBuildAndPushImage) {
                console.log(tl.loc('CreateImageWithDockerfileMessage', dockerfilePath));
                appHelper.createRunnableAppImageFromDockerfile(imageToDeploy, appSourcePath, dockerfilePath);

                // If telemetry is enabled, log that the Dockerfile scenario was targeted for this task
                telemetryHelper.setDockerfileScenario();
            }

            // Push image to Azure Container Registry
            if (shouldBuildAndPushImage) {
                new ContainerRegistryHelper().pushImageToAcr(imageToDeploy);
            } else {
                // If telemetry is enabled, log that the previously built image scenario was targeted for this task
                telemetryHelper.setImageScenario();
            }

            // Create or update the Container App
            if (!containerAppExists) {
                if (!util.isNullOrEmpty(yamlConfigPath)) {
                    // Create the Container App from the YAML configuration file
                    appHelper.createContainerAppFromYaml(containerAppName, resourceGroup, yamlConfigPath);
                } else {
                    // Create the Container App from command line arguments
                    appHelper.createContainerApp(containerAppName, resourceGroup, containerAppEnvironment, imageToDeploy, optionalCmdArgs);
                }
            } else {
                if (!util.isNullOrEmpty(yamlConfigPath)) {
                    // Update the Container App from the YAML configuration file
                    appHelper.updateContainerAppFromYaml(containerAppName, resourceGroup, yamlConfigPath);
                } else {
                    // Update the Container App from command line arguments
                    appHelper.updateContainerApp(containerAppName, resourceGroup, imageToDeploy, optionalCmdArgs);

                    // Update ingress on the Container App
                    if (ingressEnabled) {
                        appHelper.enableContainerAppIngress(containerAppName, resourceGroup, targetPort, ingress);
                    } else {
                        appHelper.disableContainerAppIngress(containerAppName, resourceGroup);
                    }

                    // Update the ACR details if provided
                    if (!util.isNullOrEmpty(acrName) && !util.isNullOrEmpty(acrUsername) && !util.isNullOrEmpty(acrPassword)) {
                        appHelper.updateContainerAppRegistryDetails(containerAppName, resourceGroup, acrName, acrUsername, acrPassword);
                    }
                }
            }

            // If telemetry is enabled, log that the task completed successfully
            telemetryHelper.setSuccessfulResult();
        } catch (err) {
            tl.setResult(tl.TaskResult.Failed, err.message);
            telemetryHelper.setFailedResult(err.message);
        } finally {
            // Logout of Azure if logged in during this task session
            authHelper.logoutAzure();

            // If telemetry is enabled, will log metadata for this task run
            telemetryHelper.sendLogs();
        }
    }
}

azurecontainerapps.runMain();
