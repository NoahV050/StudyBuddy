import globals from 'globals';

export default [
  {
    files: ['js/**/*.js', 'api/**/*.js', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.commonjs }
    },
    rules: {
      'no-constant-condition': 'error',
      'no-debugger': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error'
    }
  }
];
