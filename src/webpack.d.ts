interface WebpackRequireContext {
  keys(): string[];
  <T>(id: string): T;
}

interface WebpackRequire {
  context(
    directory: string,
    useSubdirectories: boolean,
    regExp: RegExp,
  ): WebpackRequireContext;
}

declare const require: WebpackRequire;
