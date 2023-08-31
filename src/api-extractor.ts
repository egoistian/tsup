import {
  Extractor,
  ExtractorConfig,
  ExtractorResult,
  IConfigFile,
  IExtractorConfigPrepareOptions,
} from '@microsoft/api-extractor'
import path from 'path'
import { handleError } from './errors'
import {
  formatAggregationExports,
  formatDistributionExports,
  type ExportDeclaration,
} from './exports'
import { createLogger } from './log'
import { Format, NormalizedOptions } from './options'
import {
  defaultOutExtension,
  ensureTempDeclarationDir,
  toAbsolutePath,
  toObjectEntry,
  trimDtsExtension,
  writeFileSync,
} from './utils'
import { loadPkg } from './load'

const logger = createLogger()

function rollupDtsFile(
  inputFilePath: string,
  outputFilePath: string,
  tsconfigFilePath: string
) {
  let cwd = process.cwd()
  let packageJsonFullPath = path.join(cwd, 'package.json')
  let configObject: IConfigFile = {
    mainEntryPointFilePath: inputFilePath,
    apiReport: {
      enabled: false,

      // `reportFileName` is not been used. It's just to fit the requirement of API Extractor.
      reportFileName: 'tsup-report.api.md',
    },
    docModel: { enabled: false },
    dtsRollup: {
      enabled: true,
      untrimmedFilePath: outputFilePath,
    },
    tsdocMetadata: { enabled: false },
    compiler: {
      tsconfigFilePath: tsconfigFilePath,
    },
    projectFolder: cwd,
  }
  const prepareOptions: IExtractorConfigPrepareOptions = {
    configObject,
    configObjectFullPath: undefined,
    packageJsonFullPath,
  }
  const extractorConfig: ExtractorConfig =
    ExtractorConfig.prepare(prepareOptions)

  // Invoke API Extractor
  const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
    // Equivalent to the "--local" command-line parameter
    localBuild: true,

    // Equivalent to the "--verbose" command-line parameter
    showVerboseMessages: true,
  })

  if (!extractorResult.succeeded) {
    throw new Error(
      `API Extractor completed with ${extractorResult.errorCount} errors and ${extractorResult.warningCount} warnings when processing ${inputFilePath}`
    )
  }
}

async function rollupDtsFiles(
  options: NormalizedOptions,
  exports: ExportDeclaration[],
  format: Format
) {
  const dtsOptions = options.experimentalDts || {}
  dtsOptions.entry = dtsOptions.entry || options.entry

  if (Array.isArray(dtsOptions.entry) && dtsOptions.entry.length > 1) {
    dtsOptions.entry = toObjectEntry(dtsOptions.entry)
  }

  let declarationDir = ensureTempDeclarationDir()
  let outDir = options.outDir || 'dist'
  let pkg = await loadPkg(process.cwd())
  let dtsExtension = defaultOutExtension({ format, pkgType: pkg.type }).dts

  let dtsInputFilePath = path.join(
    declarationDir,
    '_tsup-dts-aggregation' + dtsExtension
  )
  let dtsOutputFilePath = path.join(outDir, '_tsup-dts-rollup' + dtsExtension)

  writeFileSync(
    dtsInputFilePath,
    formatAggregationExports(exports, declarationDir)
  )

  rollupDtsFile(
    dtsInputFilePath,
    dtsOutputFilePath,
    options.tsconfig || 'tsconfig.json'
  )

  for (let [out, sourceFileName] of Object.entries(dtsOptions.entry)) {
    sourceFileName = toAbsolutePath(sourceFileName)
    const outFileName = path.join(outDir, out + dtsExtension)

    const declarations = exports.filter(
      (declaration) => declaration.sourceFileName === sourceFileName
    )

    writeFileSync(
      outFileName,
      formatDistributionExports(declarations, outFileName, dtsOutputFilePath)
    )
  }
}

export async function runDtsRollup(
  options: NormalizedOptions,
  exports?: ExportDeclaration[]
) {
  try {
    const start = Date.now()
    const getDuration = () => {
      return `${Math.floor(Date.now() - start)}ms`
    }
    logger.info('dts', 'Build start')

    if (!exports) {
      throw new Error('Unexpected internal error: dts exports is not define')
    }
    for (const format of options.format) {
      await rollupDtsFiles(options, exports, format)
    }
    logger.success('dts', `⚡️ Build success in ${getDuration()}`)
  } catch (error) {
    handleError(error)
    logger.error('dts', 'Build error')
  }
}
