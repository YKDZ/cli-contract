# @boringparts/cli-contract

## 0.7.0

### Minor Changes

- Consolidate the public distribution into `@boringparts/cli-contract`, moving consumer testing helpers to the `@boringparts/cli-contract/testing` subpath (replacing `@ykdz/cli-contract` and `@ykdz/cli-contract-testing`), with `sideEffects: false` and package-relative module imports.

- Pass the contract as the first argument to `runCliScenario(cli, scenario)`. Entries from `defineCommandScenarios` and `defineFailureScenarios` can be passed directly as the second argument. Hard-rename `CliScenarioCapture` to `CliObservation`.

- Upgrade help fact wording templates and diagnostic alignment for single-package publishing under `boringparts/cli-contract`.

- Text presenters receive the same validated command input as the handler. Data, failure and record presenters take `(payload, { input })`. Completion and stream-success presenters take `({ input })`. The runtime always supplies the context. If a formatter previously used that argument position for an optional parameter, register a wrapper such as `(payload) => format(payload)` to keep its default. Pass the context explicitly when calling a typed presenter directly.

  Presenter types now take the validated input type, for example `AtomicTextPresenter<Report, Input>`. Generic wrappers using `AtomicTextOptions` or `StreamTextOptions` take the command input schema as their second type argument.

  Use `queryCliContract(cli, { path, target })` for discovery and `new CliWriteError({ destination, cause })` to construct a write error.

## 0.6.0

### Minor Changes

- Share command execution declarations across output modes while keeping presenters mode-specific. Use the command's `outputs` callback to declare executions and attach structured or text presenters.

  Reduce production installation size by removing the public declaration's dependency on Node types. Buffer ordered Node stream writes within backpressure limits, and reduce repeated work during contract definition while preserving the serialized manifest structure.

## 0.5.0

### Minor Changes

- d1d862f: 为命令提供独立的输出方式、契约发现与可验证的调用示例，并将契约清单升级到 5、结构化线协议升级到 3。最低运行环境升至 Node 26。
