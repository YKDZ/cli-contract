# @ykdz/cli-contract-testing

## 0.6.0

### Minor Changes

- Share command execution declarations across output modes while keeping presenters mode-specific. Use the command's `outputs` callback to declare executions and attach structured or text presenters.

  Reduce production installation size by removing the public declaration's dependency on Node types. Buffer ordered Node stream writes within backpressure limits, and reduce repeated work during contract definition while preserving the serialized manifest structure.

### Patch Changes

- Updated dependencies
  - @ykdz/cli-contract@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [d1d862f]
  - @ykdz/cli-contract@0.5.0
