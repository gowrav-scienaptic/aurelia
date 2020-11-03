import { IOptionalPreprocessOptions, preprocess, preprocessOptions } from '@aurelia/plugin-conventions';
import tsJest from 'ts-jest';
const { createTransformer: tsCreateTransformer } = tsJest;
import type { Config } from '@jest/types';
import type { TransformOptions, TransformedSource, CacheKeyOptions } from '@jest/transform';
import * as path from 'path';

const tsTransformer = tsCreateTransformer();

function _createTransformer(
  conventionsOptions = {},
  // for testing
  _preprocess = preprocess,
  _tsProcess = tsTransformer.process.bind(tsTransformer)
) {
  const au2Options = preprocessOptions(conventionsOptions as IOptionalPreprocessOptions);

  function getCacheKey(
    fileData: string,
    filePath: Config.Path,
    configStr: string,
    options: CacheKeyOptions
  ): string {
    const tsKey = tsTransformer.getCacheKey(fileData, filePath, configStr, options);
    return `${tsKey}:${JSON.stringify(au2Options)}`;
  }

  // Wrap ts-jest process
  function process(
    sourceText: string,
    sourcePath: Config.Path,
    config: Config.ProjectConfig,
    transformOptions?: TransformOptions
  ): TransformedSource {
    const result = _preprocess(
      { path: sourcePath, contents: sourceText },
      au2Options
    );
    let newSourcePath = sourcePath;
    if (result !== undefined) {
      let newCode = result.code;
      if (au2Options.templateExtensions.includes(path.extname(sourcePath))) {
        // Rewrite foo.html to foo.html.ts, or foo.md to foo.md.ts
        newSourcePath += '.ts';
        newCode = `// @ts-nocheck\n${newCode}`;
      }
      return _tsProcess(newCode, newSourcePath, config, transformOptions);
    }
    return _tsProcess(sourceText, sourcePath, config, transformOptions);
  }

  return {
    canInstrument: false,
    getCacheKey,
    process
  };
}

function createTransformer(conventionsOptions = {}) {
  return _createTransformer(conventionsOptions);
}

const { canInstrument, getCacheKey, process } = createTransformer();
export { canInstrument, getCacheKey, process, createTransformer, _createTransformer };
