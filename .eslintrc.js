module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:prettier/recommended',
  ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react', 'prettier'],
  rules: {
    'react/react-in-jsx-scope': 'off', // Not needed for React 17+
    'prettier/prettier': [
      'error',
      {
        endOfLine: 'auto',
        semi: true,
        trailingComma: 'all',
        singleQuote: true,
        printWidth: 100,
        tabWidth: 2,
      },
    ],
    'react/prop-types': 'off', // We can add this later if we use PropTypes
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};