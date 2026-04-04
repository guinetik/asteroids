import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginOxlint from 'eslint-plugin-oxlint'
import pluginJsdoc from 'eslint-plugin-jsdoc'
import skipFormatting from 'eslint-config-prettier/flat'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  vueTsConfigs.recommended,

  {
    name: 'app/jsdoc',
    files: ['src/**/*.ts'],
    ignores: ['src/**/__tests__/*'],
    plugins: { jsdoc: pluginJsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'warn',
        {
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
          },
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
          ],
          checkConstructors: false,
          enableFixer: false,
        },
      ],
    },
  },

  // Disable ESLint rules that oxlint already covers
  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  skipFormatting,
)
