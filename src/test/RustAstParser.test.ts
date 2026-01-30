import * as vscode from 'vscode';
import assert from 'assert';
import { RustAstParser } from '../services/sourceToDiagram/ast/rust/RustAstParser';
import { Logger } from '../LoggerComponents/Logger';

suite('RustAstParser Test Suite', () => {
    console.log("RustAstParser test");
    let logger: Logger;
    let parser: RustAstParser;

    suiteSetup(() => {
        const mockChannel: vscode.OutputChannel = {
            name: 'Test',
            append: (val) => { console.log(val); },
            appendLine: (val) => { console.log(val); },
            replace: () => { },
            clear: () => { },
            show: () => { },
            hide: () => { },
            dispose: () => { }
        };
        logger = new Logger(mockChannel);
        parser = new RustAstParser(logger);
    });

    test('supports should return true for rust', () => {
        assert.strictEqual(parser.supports('rust'), true);
        assert.strictEqual(parser.supports('typescript'), false);
    });

    test('parse should extract struct information from Rust source', async () => {
        const content = `
pub struct Point {
    pub x: f64,
    pub y: f64,
}

struct PrivateStruct {
    data: String,
}
        `;
        const uri = vscode.Uri.file('/test.rs');
        const classes = await parser.parse(uri, content);

        assert.strictEqual(classes.length, 2, 'Should extract 2 structs');

        // Point struct
        const point = classes.find(c => c.name === 'Point');
        assert.ok(point, 'Point should be found');
        assert.strictEqual(point.kind, 'struct');
        assert.strictEqual(point.attributes.length, 2);

        const xField = point.attributes.find(a => a.name === 'x');
        assert.ok(xField);
        assert.strictEqual(xField.visibility, 'public');
        assert.strictEqual(xField.type, 'f64');

        const yField = point.attributes.find(a => a.name === 'y');
        assert.ok(yField);
        assert.strictEqual(yField.visibility, 'public');
        assert.strictEqual(yField.type, 'f64');

        // PrivateStruct
        const privateStruct = classes.find(c => c.name === 'PrivateStruct');
        assert.ok(privateStruct);
        assert.strictEqual(privateStruct.attributes.length, 1);
        const dataField = privateStruct.attributes[0];
        assert.strictEqual(dataField.name, 'data');
        assert.strictEqual(dataField.visibility, 'private');
    });

    test('parse should extract enum information from Rust source', async () => {
        const content = `
pub enum Color {
    Red,
    Green,
    Blue,
}

enum Message {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
}
        `;
        const uri = vscode.Uri.file('/test.rs');
        const classes = await parser.parse(uri, content);

        assert.strictEqual(classes.length, 2, 'Should extract 2 enums');

        // Color enum
        const color = classes.find(c => c.name === 'Color');
        assert.ok(color, 'Color should be found');
        assert.strictEqual(color.kind, 'enum');
        assert.strictEqual(color.attributes.length, 3);

        const variants = color.attributes.map(a => a.name);
        assert.ok(variants.includes('Red'));
        assert.ok(variants.includes('Green'));
        assert.ok(variants.includes('Blue'));

        // Message enum
        const message = classes.find(c => c.name === 'Message');
        assert.ok(message, 'Message should be found');
        assert.strictEqual(message.kind, 'enum');
    });

    test('parse should extract trait information from Rust source', async () => {
        const content = `
pub trait Drawable {
    fn draw(&self);
    fn get_name(&self) -> String;
}

trait Animal: Clone + Debug {
    fn speak(&self);
}
        `;
        const uri = vscode.Uri.file('/test.rs');
        const classes = await parser.parse(uri, content);

        assert.strictEqual(classes.length, 2, 'Should extract 2 traits');

        // Drawable trait
        const drawable = classes.find(c => c.name === 'Drawable');
        assert.ok(drawable, 'Drawable should be found');
        assert.strictEqual(drawable.kind, 'interface');
        assert.strictEqual(drawable.operations.length, 2);

        const drawMethod = drawable.operations.find(o => o.name === 'draw');
        assert.ok(drawMethod);

        const getNameMethod = drawable.operations.find(o => o.name === 'get_name');
        assert.ok(getNameMethod);
        assert.strictEqual(getNameMethod.returnType, 'String');

        // Animal trait with supertraits
        const animal = classes.find(c => c.name === 'Animal');
        assert.ok(animal, 'Animal should be found');
        assert.strictEqual(animal.kind, 'interface');
        assert.ok(animal.interfaces.includes('Clone') || animal.interfaces.includes('Debug'));
    });

    test('parse should extract impl methods and associate with struct', async () => {
        const content = `
pub struct Rectangle {
    width: f64,
    height: f64,
}

impl Rectangle {
    pub fn new(width: f64, height: f64) -> Rectangle {
        Rectangle { width, height }
    }

    pub fn area(&self) -> f64 {
        self.width * self.height
    }
}
        `;
        const uri = vscode.Uri.file('/test.rs');
        const classes = await parser.parse(uri, content);

        assert.strictEqual(classes.length, 1, 'Should extract 1 struct');

        const rectangle = classes.find(c => c.name === 'Rectangle');
        assert.ok(rectangle, 'Rectangle should be found');
        assert.strictEqual(rectangle.kind, 'struct');

        // Attributes from struct
        assert.strictEqual(rectangle.attributes.length, 2);

        // Operations from impl
        assert.strictEqual(rectangle.operations.length, 2);

        const newMethod = rectangle.operations.find(o => o.name === 'new');
        assert.ok(newMethod);
        assert.strictEqual(newMethod.visibility, 'public');

        const areaMethod = rectangle.operations.find(o => o.name === 'area');
        assert.ok(areaMethod);
        assert.strictEqual(areaMethod.returnType, 'f64');
    });

    test('parse should extract trait implementation for struct', async () => {
        const content = `
pub struct Circle {
    radius: f64,
}

pub trait Shape {
    fn area(&self) -> f64;
}

impl Shape for Circle {
    fn area(&self) -> f64 {
        3.14159 * self.radius * self.radius
    }
}
        `;
        const uri = vscode.Uri.file('/test.rs');
        const classes = await parser.parse(uri, content);

        // Should find Circle struct and Shape trait
        const circle = classes.find(c => c.name === 'Circle');
        assert.ok(circle, 'Circle should be found');
        assert.strictEqual(circle.kind, 'struct');

        // Circle should have Shape as an implemented interface
        assert.ok(circle.interfaces.includes('Shape'), 'Circle should implement Shape');

        // Circle should have the area method from impl
        const areaMethod = circle.operations.find(o => o.name === 'area');
        assert.ok(areaMethod, 'Circle should have area method from impl');
    });
});
