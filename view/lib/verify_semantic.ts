
import { SpecDslParser } from "./SpecDslParser";
import { ClassDiagramService } from "./application/ClassDiagramService";
import { DomainModel } from "./DomainModel";

const parser = new SpecDslParser();
const service = new ClassDiagramService(DomainModel.createEmpty());

const dsl = `
class Order
  - orderAmount: number
  - status: string
  + calculateTotal()
    Scenario: Calculate total for pending orders
      Given orderAmount が 100 以上 であること
      And status が "pending" 状態 であること
      When calculateTotal を呼び出す
      Then 合計金額を計算する

alias "受注金額" as "orderAmount"

class AdvancedOrder
  - orderAmount: number
  + process()
    Scenario: Process advanced order
      Given 受注金額 が 500 以上 であること
`;

const result = parser.parse(dsl, service);

console.log("--- Classes ---");
result.classes.forEach(c => {
    console.log(`Class: ${c.name}`);
    c.operations.forEach(op => {
        console.log(`  Operation: ${op.name}`);
        if (op.workflow) {
            op.workflow.nodes.forEach(node => {
                console.log(`    Node: ${node.label}`);
                console.log(`      Bindings: ${JSON.stringify(node.metadata?.bindings)}`);
                console.log(`      Constraints: ${JSON.stringify(node.metadata?.constraints)}`);
                console.log(`      InferredState: ${node.metadata?.inferredState}`);
            });
        }
    });
});
