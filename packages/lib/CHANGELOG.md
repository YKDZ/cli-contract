# @ykdz/cli-contract

## 0.6.0

### Minor Changes

- Share command execution declarations across output modes while keeping presenters mode-specific. Use the command's `outputs` callback to declare executions and attach structured or text presenters.

  Reduce production installation size by removing the public declaration's dependency on Node types. Buffer ordered Node stream writes within backpressure limits, and reduce repeated work during contract definition while preserving the serialized manifest structure.

## 0.5.0

### Minor Changes

- d1d862f: 为命令提供独立的输出方式、契约发现与可验证的调用示例，并将契约清单升级到 5、结构化线协议升级到 3。最低运行环境升至 Node 26。
