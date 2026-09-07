module.exports = {
  content: [
    './index.html',
    './app.js',
    './auth.js',
    './storage.js',
    './cloudbase-client.js'
  ],

  theme: {
    extend: {
      colors: {
        paper: '#f7f6f2',
        ink: '#2b2926',
        muted: '#77736d',
        line: '#e7e3dc',
        clay: '#c96545',
        claySoft: '#f4e5de',
        sage: '#627a66',
        sageSoft: '#e7eee8'
      },

      boxShadow: {
        soft:
          '0 1px 2px rgba(35,31,27,.05), 0 8px 30px rgba(35,31,27,.04)'
      },

      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif'
        ]
      }
    }
  },

  plugins: []
};