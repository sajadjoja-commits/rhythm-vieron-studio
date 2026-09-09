import { WorkflowDefinition, WorkflowStepConfig, WorkflowType } from "./types";

export class AIWorkflowBuilder {
  private definition: WorkflowDefinition;

  constructor(id: string, name: string, type: WorkflowType = "custom", description: string = "") {
    this.definition = {
      id,
      name,
      type,
      description,
      steps: [],
    };
  }

  public static create(id: string, name: string, type: WorkflowType = "custom", description: string = ""): AIWorkflowBuilder {
    return new AIWorkflowBuilder(id, name, type, description);
  }

  public setDescription(description: string): this {
    this.definition.description = description;
    return this;
  }

  public addStep(step: WorkflowStepConfig): this {
    this.definition.steps.push(step);
    return this;
  }

  public addStepAction(
    id: string,
    name: string,
    pluginId: string,
    actionName: string,
    params?: Record<string, any>,
    inputMapper?: (prevResult: any, initialInput: any) => any,
    outputMapper?: (stepResult: any) => any
  ): this {
    this.definition.steps.push({
      id,
      name,
      pluginId,
      actionName,
      params,
      inputMapper,
      outputMapper,
    });
    return this;
  }

  public build(): WorkflowDefinition {
    if (!this.definition.steps || this.definition.steps.length === 0) {
      throw new Error(`Workflow [${this.definition.id}] must contain at least one step.`);
    }
    return { ...this.definition, steps: [...this.definition.steps] };
  }
}
