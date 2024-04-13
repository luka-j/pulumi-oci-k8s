import {ComponentResource, ComponentResourceOptions, Output} from "@pulumi/pulumi";
import {Budget as OciBudget, Rule} from "@pulumi/oci/budget";

interface BudgetRuleArgs {
    threshold: number;
    thresholdType: "ABSOLUTE" | "PERCENTAGE";
    type: "ACTUAL" | "FORECAST";
    description?: string;
    displayName?: string;
    message: string;
}

class Budget extends ComponentResource {
    public budget: OciBudget;
    public rules: Rule[];

    constructor(name: string, args: { tenancyId: Output<string>, compartmentId: Output<string>, amount: number,
                    description?: string, displayName?: string, rules: BudgetRuleArgs[]},
                opts?: ComponentResourceOptions) {
        super("master:oci:Budget", name, args, opts);

        this.budget = new OciBudget(`${name}_budget`, {
            compartmentId: args.tenancyId,
            amount: args.amount,
            resetPeriod: "MONTHLY",
            description: args.description,
            displayName: args.displayName,
            targetType: "COMPARTMENT",
            targets: [args.compartmentId],
        }, { parent: this });

        this.rules = args.rules.map((rule, i) =>
            new Rule(`${name}_budget_rule_${i}`, {
                budgetId: this.budget.id,
                threshold: rule.threshold,
                thresholdType: rule.thresholdType,
                type: rule.type,
                description: rule.description,
                displayName: rule.displayName,
                message: rule.message,
            }, { parent: this }));
    }
}

export default Budget;