import {CommandContext, Configuration, Project}                      from '@berry/core';
import {MessageName, StreamReport}                                   from '@berry/core';
import {structUtils}                                                 from '@berry/core';
import {Command}                                                     from 'clipanion';
import getPath                                                       from 'lodash.get';

import {Constraints}                                                 from '../../Constraints';

// eslint-disable-next-line arca/no-default-export
export default class ConstraintsCheckCommand extends Command<CommandContext> {
  static usage = Command.Usage({
    category: `Constraints-related commands`,
    description: `check that the project constraints are met`,
    details: `
      This command will run constraints on your project and emit errors for each one that is found but isn't met. If any error is emitted the process will exit with a non-zero exit code.

      For more information as to how to write constraints, please consult our dedicated page on our website: .
    `,
    examples: [[
      `Check that all constraints are satisfied`,
      `yarn constraints check`,
    ]],
  });

  @Command.Path(`constraints`, `check`)
  async execute() {
    const configuration = await Configuration.find(this.context.cwd, this.context.plugins);
    const {project} = await Project.find(configuration, this.context.cwd);
    const constraints = await Constraints.find(project);

    const report = await StreamReport.start({
      configuration,
      stdout: this.context.stdout,
    }, async report => {
      const result = await constraints.process();

      for (const {workspace, dependencyIdent, dependencyRange, dependencyType} of result.enforcedDependencies) {
        const dependencyDescriptor = workspace.manifest[dependencyType].get(dependencyIdent.identHash);

        if (dependencyRange !== null) {
          if (!dependencyDescriptor) {
            report.reportError(MessageName.CONSTRAINTS_MISSING_DEPENDENCY, `${structUtils.prettyWorkspace(configuration, workspace)} must depend on ${structUtils.prettyIdent(configuration, dependencyIdent)} (via ${structUtils.prettyRange(configuration, dependencyRange)}) in ${dependencyType}, but doesn't`);
          } else if (dependencyDescriptor.range !== dependencyRange) {
            report.reportError(MessageName.CONSTRAINTS_INCOMPATIBLE_DEPENDENCY, `${structUtils.prettyWorkspace(configuration, workspace)} must depend on ${structUtils.prettyIdent(configuration, dependencyIdent)} via ${structUtils.prettyRange(configuration, dependencyRange)} in ${dependencyType}, but uses ${structUtils.prettyRange(configuration, dependencyDescriptor.range)} instead`);
          }
        } else {
          if (dependencyDescriptor) {
            report.reportError(MessageName.CONSTRAINTS_EXTRANEOUS_DEPENDENCY, `${structUtils.prettyWorkspace(configuration, workspace)} has an extraneous dependency on ${structUtils.prettyIdent(configuration, dependencyIdent)} in ${dependencyType}`);
          }
        }
      }

      for (const {workspace, dependencyIdent, dependencyType, reason} of result.invalidDependencies) {
        const dependencyDescriptor = workspace.manifest[dependencyType].get(dependencyIdent.identHash);

        if (dependencyDescriptor) {
          report.reportError(MessageName.CONSTRAINTS_INVALID_DEPENDENCY, `${structUtils.prettyWorkspace(configuration, workspace)} has an invalid dependency on ${structUtils.prettyIdent(configuration, dependencyIdent)} in ${dependencyType} (invalid because ${reason})`);
        }
      }

      for (const {workspace, fieldPath, fieldValue} of result.enforcedFields) {
        const actualValue = getPath(workspace.manifest.raw, fieldPath);

        if (fieldValue !== null) {
          if (actualValue === undefined) {
            report.reportError(MessageName.CONSTRAINTS_MISSING_FIELD, `${structUtils.prettyWorkspace(configuration, workspace)} must have field "${fieldPath}" value ${JSON.stringify(fieldValue)}, but doesn't`);
          } else if (actualValue !== fieldValue && `${actualValue}` !== fieldValue) {
            report.reportError(MessageName.CONSTRAINTS_INCOMPATIBLE_FIELD, `${structUtils.prettyWorkspace(configuration, workspace)} must have field "${fieldPath}" with value ${JSON.stringify(fieldValue)} but it has value ${JSON.stringify(actualValue)}`);
          }
        } else {
          if (actualValue !== undefined && actualValue !== null) {
            report.reportError(MessageName.CONSTRAINTS_EXTRANEOUS_FIELD, `${structUtils.prettyWorkspace(configuration, workspace)} has an extraneous field "${fieldPath}" with value ${JSON.stringify(actualValue)}`);
          }
        }
      }
    });

    return report.exitCode();
  }
}
