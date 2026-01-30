import { IAstParser } from './IAstParser';
import { TypeScriptAstParser } from './typescript/TypescriptAstParser';
import { CsharpAstParser } from './csharp/CsharpAstParser';
import { JavaAstParser } from './java/JavaAstParser';
import { RustAstParser } from './rust/RustAstParser';
import { Logger } from '../../../LoggerComponents/Logger';

/**
 * 言語IDに基づいて適切なASTパーサーを提供するファクトリークラス
 */
export class AstParserFactory {
    private static parsers: IAstParser[] = [];

    /**
     * ファクトリーを初期化し、利用可能なパーサーを登録する
     * @param logger 
     */
    public static initialize(logger: Logger): void {
        if (this.parsers.length === 0) {
            this.parsers.push(new TypeScriptAstParser(logger));
            this.parsers.push(new CsharpAstParser(logger));
            this.parsers.push(new JavaAstParser(logger));
            this.parsers.push(new RustAstParser(logger));
        }
    }

    /**
     * 指定された言語IDに対応するパーサーを取得する
     * @param languageId 
     * @returns 
     */
    public static getParser(languageId: string): IAstParser | null {
        for (const parser of this.parsers) {
            if (parser.supports(languageId)) {
                return parser;
            }
        }
        return null;
    }
}
