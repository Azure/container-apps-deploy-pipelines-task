<!-- PLEASE DO NOT DELETE THIS TEMPLATE -->

## Description

<!-- Please include a brief description of the changes made in this PR. -->

## Issue

<!-- If possible, please include a link to the GitHub issue or ADO work item associated with this change. If none exists, please put down "N/A". -->

## Building the task

<!-- Please check the following boxes that correspond with building the task. -->

- [ ] `npm install` was ran within the `azurecontainerapps` folder to regenerate the `package-lock.json` file
- [ ] `tsc` was ran within the `azurecontainerapps` folder to ensure all TypeScript was successfully compiled into JavaScript

## Testing the task

<!-- Please check the following boxes that correspond with testing the task. -->

- [ ] A new version of the `AzureContainerAppsTest` task was generated with these changes and published
  - [ ] The task was ran against the existing test suite to ensure backwards compatibility
  - [ ] The task was ran against a workflow that tests the changes introduced in this PR
- [ ] The local TypeScript code was tested against the `mocha` tests

## Deploying the task

<!-- Please check the following boxes that correspond with deploying the task. -->

- [ ] New argument(s) was added
  - [ ] The `inputs` array was updated in `task.json` to reflect the new argument(s)
  - [ ] The `inputs` array was updated in `task.loc.json` to reflect the new argument(s)
  - [ ] The corresponding `loc` properties were updated in `resources.resjson` to reflect the new argument(s)
- [ ] New version of the task
  - [ ] The `version` property was updated in `task.json` to reflect the new version
  - [ ] The `version` property was updated in `task.loc.json` to reflect the new version
  - [ ] The `version` property was updated in `vss-extension.json` to reflect the new version
  - [ ] The `releaseNotes` property was updated in `task.json` to reflect the changes made since the last release
  - [ ] The `releaseNotes` property was updated in `resources.resjson` to reflect the changes made since the last release