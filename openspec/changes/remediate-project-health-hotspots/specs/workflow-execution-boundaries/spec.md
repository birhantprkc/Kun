## ADDED Requirements

### Requirement: Workflow run coordination
Workflow graph planning, scheduling, run lifecycle, approvals, cancellation, and
live status SHALL have explicit owners and one coordinator per run.

#### Scenario: Cancellation during node execution
- **WHEN** a workflow is cancelled while a node executor is awaiting I/O
- **THEN** the executor SHALL abort and the run SHALL reach one terminal state

### Requirement: Node executor registry
Each workflow node family SHALL execute through a typed node adapter registered by
kind, with shared limits and output contracts enforced by the coordinator.

#### Scenario: Existing workflow execution
- **WHEN** an existing stored workflow runs after extraction
- **THEN** node order, branch selection, inputs, outputs, retries, and terminal status
  SHALL match the characterized run

### Requirement: Node-specific configuration UI
Workflow configuration SHALL render node-specific editors behind a shared panel
contract and preserve variable binding and validation behavior.

#### Scenario: Edit node configuration
- **WHEN** a user edits and commits a supported node field
- **THEN** the same workflow patch and validation feedback SHALL be produced
