const fs = require('fs');
const path = require('path');

const TokenType = {
  EOF: 0,
  Word: 1,
  String: 2,
  OpenSquareBracket: 3,
  CloseSquareBracket: 4,
  OpenBracket: 5,
  CloseBracket: 6,
  Backlash: 7,
  Comment: 8,
  Comma: 9,
  Colon: 10,
  DoubleQuotationMark: 11,
  Unknown: 12,
  EOL: 13,
}

const TokenName = [
  'EOF',
  'Word',
  'String',
  '[',
  ']',
  '{',
  '}',
  '/',
  'Comment',
  ',',
  ':',
  '"',
  'Unknown',
  'EOL',
];

class Parser {
  reset = () => {
    this.index = -1;
    this.col = 1;
    this.ln = 1;
    this.emit = {};
    this.tokens = [];
    this.thisClass = {};
  };

  inRange = (s, a, b) => {
    const n = s.charCodeAt(0);
    if (n >= a.charCodeAt(0) && n <= b.charCodeAt(0)) {
      return true;
    }
    return false;
  }

  errorLex = s => {
    throw new Error(`[${this.ln}:${this.col}]: ${s}`);
  };

  error = s => {
    const token = this.tokens[this.index];
    throw new Error(`[${token.ln}:${token.col}]: ${s}`);
  };

  // Lexing goes here

  peekAtNextChar = () => {
    const pos = this.index + 1;
    if (pos < this.source.length) {
      return this.source.charAt(pos);
    }
    return String.fromCharCode(0);
  };

  nextChar = () => {
    this.index += 1;
    this.col += 1;
    if (this.index < this.source.length) {
      const c = this.source.charAt(this.index);
      if (c === '\n') {
        this.ln += 1;
        this.col = 1;
      }
      return c;
    }
    return String.fromCharCode(0);
  };

  lex = () => {
    while (this.index < this.source.length) {
      let word = '';
      let c = '';
      let result = {};
      c = this.nextChar();
      if (c.charCodeAt(0) <= 32 && c.charCodeAt(0) > 0 && c !== '\n') {
        continue;
      }
      result.position = this.index;
      result.index = this.tokens.length;
      result.ln = this.ln;
      result.col = this.col;
      switch (true) {
        case (c === '['):
          result.kind = TokenType.OpenSquareBracket;
          result.value = c;
          break;
        case (c === ']'):
          result.kind = TokenType.CloseSquareBracket;
          result.value = c;
          break;
        case (c === '{'):
          result.kind = TokenType.OpenBracket;
          result.value = c;
          break;
        case (c === '}'):
          result.kind = TokenType.CloseBracket;
          result.value = c;
          break;
        case (c === '/'):
          result.kind = TokenType.Backlash;
          result.value = c;
          break;
        case (c === ':'):
          result.kind = TokenType.Colon;
          result.value = c;
          break;
        case (c === ','):
          result.kind = TokenType.Comma;
          result.value = c;
          break;
        case (c === '\n'):
          result.kind = TokenType.EOL;
          result.value = c;
          break;
        case (c === '"'): {
          result.kind = TokenType.String;
          let isNotDone = true;
          word = '';
          while (isNotDone) {
            const cc = this.nextChar();
            switch (cc.charCodeAt(0)) {
              case 0:
                this.errorLex('String not terminated');
                break;
              case c.charCodeAt(0):
                isNotDone = false;
                break;
              default:
                word += cc;
                break;
            }
          }
          result.value = c + word + c;
          break;
        }
        case (c === '#'): {
          result.kind = TokenType.Comment;
          let isNotDone = true;
          word = '';
          while (isNotDone) {
            const cc = this.nextChar();
            switch (cc.charCodeAt(0)) {
              case 0:
              case '\n'.charCodeAt(0):
                isNotDone = false;
                break;
              default:
                word += cc;
                break;
            }
          }
          result.value = word;
          break;
        }
        case (this.inRange(c, 'a', 'z') ||
          this.inRange(c, 'A', 'Z') ||
          this.inRange(c, '0', '9') || c === '_'):
          word = c;
          c = this.peekAtNextChar();
          while (this.inRange(c, 'a', 'z') ||
            this.inRange(c, 'A', 'Z') ||
            this.inRange(c, '0', '9') || c === '_' || c === '-' || c === '.') {
            word += this.nextChar();
            c = this.peekAtNextChar();
          }
          result.value = word;
          result.kind = TokenType.Word;
          break;
        case (c === String.fromCharCode(0)):
          result.kind = TokenType.EOF;
          break;
        default:
          result.kind = TokenType.Unknown;
          result.value = c;
          break;
      }
      this.tokens.push(result);
    }
    this.index = -1;
  };

  // Parsing goes here

  nextToken = () => {
    this.index += 1;
    if (this.index >= this.tokens.length) {
      this.index -= 1;
    }
    return this.tokens[this.index];
  };

  peekAtNextToken = () => {
    let pos = this.index + 1;
    if (pos >= this.tokens.length) {
      pos -= 1;
    }
    return this.tokens[pos];
  };

  TokenTypeString = tokens => {
    let result = '';
    for (let i = 0; i < tokens.length; i++) {
      result += `"${TokenName[tokens[i]]}"`;
      if (i < tokens.length - 1) {
        result += ' or ';
      }
    }
    return result;
  };

  nextTokenExpected = expected => {
    const token = this.nextToken();
    for (let i = 0; i < expected.length; i++) {
      if (token.kind === expected[i]) {
        return token;
      }
    }
    this.error(`Expected ${this.TokenTypeString(expected)}, got "${TokenName[token.kind]}".`);
  }

  parseFieldSection = () => {
    let token;
    while (true) {
      if (this.peekAtNextToken().kind === TokenType.CloseBracket) {
        this.nextToken();
        return;
      }
      if (this.peekAtNextToken().kind === TokenType.Comment || this.peekAtNextToken().kind === TokenType.EOL) {
        this.nextToken();
        continue;
      }
      if (this.peekAtNextToken().kind === TokenType.Word &&
        this.peekAtNextToken().value === 'x3d-nodes-to-pascal') {
        do {
          token = this.nextToken();
          if (token.kind === TokenType.CloseBracket) {
            return;
          }
        } while (token.kind !== TokenType.EOL);
        continue;
      }
      const field = {};
      let hasDefault = false;
      this.thisClass.fields.push(field);
      // type
      token = this.nextTokenExpected([TokenType.Word]);
      field.type = token.value;
      // in/out
      token = this.nextTokenExpected([TokenType.OpenSquareBracket]);
      if (this.peekAtNextToken().kind === TokenType.CloseSquareBracket) {
        hasDefault = true;
      }
      do {
        token = this.nextToken();
        if (token.kind === TokenType.Word && token.value === 'in') {
          hasDefault = true;
        }
      } while (token.kind !== TokenType.CloseSquareBracket);
      // name
      token = this.nextTokenExpected([TokenType.Word]);
      field.name = token.value;
      // console.log(token.value);
      // default
      if (hasDefault) {
        token = this.peekAtNextToken();
        if (token.kind === TokenType.String) {
          token = this.nextToken();
          field.value = token.value;
        } else if (token.kind === TokenType.OpenSquareBracket) {
          let s = '';
          do {
            token = this.nextToken();
            s += token.value;
          } while (token.kind !== TokenType.CloseSquareBracket);
          field.value = s;
        } else if (token.kind === TokenType.Word) {
          if (token.value === 'TRUE' || token.value === 'FALSE') {
            token = this.nextToken();
          } else if (!isNaN(token.value)) {
            let s = '';
            while (this.peekAtNextToken().kind === TokenType.Word) {
              token = this.nextToken();
              s += token.value + ' ';
            }
            s = s.trim();
            field.value = s;
          }
        }
      }
      do {
        token = this.nextToken();
        if (token.kind === TokenType.CloseBracket) {
          return;
        }
      } while (token.kind !== TokenType.EOL);
      if (this.peekAtNextToken().kind === TokenType.CloseBracket) {
        token = this.nextToken();
        return;
      }
    }
  }

  parseClassSection = () => {
    let isSelf = true;
    while (true) {
      let token = this.peekAtNextToken();
      switch (token.kind) {
        case TokenType.Word:
          if (isSelf) {
            isSelf = false;
            this.emit[token.value] = this.thisClass;
          }
          this.thisClass.parents.push(token.value);
          this.nextToken();
          break;
        case TokenType.OpenBracket:
          this.nextToken();
          this.nextTokenExpected([TokenType.EOL]);
          this.parseFieldSection();
          return;
        default:
          this.nextToken();
          break;
      }
    }
  }

  parse = () => {
    while (true) {
      let token = this.peekAtNextToken();
      switch (token.kind) {
        case TokenType.Word:
          this.thisClass = {
            parents: [],
            fields: [],
          };
          this.parseClassSection();
          break;
        case TokenType.EOF:
          console.log('Done parsing!');
          return;
        default:
          this.nextToken();
          break;
      }
    }
  }

  execute = source => {
    this.source = source;
    this.reset();
    this.lex();
    this.parse();
    return this.emit;
  }
}

const promiseAllP = (items, block) => {
  const promises = [];
  items.forEach(function (item, index) {
    promises.push(function (item, i) {
      return new Promise(function (resolve, reject) {
        return block.apply(this, [item, index, resolve, reject]);
      });
    }(item, index))
  });
  return Promise.all(promises);
};

const readFiles = dirname => {
  return new Promise((resolve, reject) => {
    fs.readdir(dirname, (err, filenames) => {
      if (err) return reject(err);
      promiseAllP(filenames,
        (filename, index, resolve, reject) => {
          fs.readFile(path.resolve(dirname, filename), 'utf-8', (err, content) => {
            if (err) return reject(err);
            return resolve({ filename, content });
          });
        })
        .then(results => {
          return resolve(results);
        })
        .catch(error => {
          return reject(error);
        });
    });
  });
}

const predefineSnippets = JSON.parse(`
{
  "X3D": {
      "prefix": "#X3D",
      "body": [
          "#X3D V4.0 utf8"
      ],
      "description": "X3D V4.0"
  },
  "DEF": {
      "prefix": "DEF",
      "body": [
          "DEF \${1:variable}"
      ],
      "description": ""
  },
  "PROTO": {
      "prefix": "PROTO",
      "body": [
          "PROTO \${1:name} [",
              "\\tinitializeOnly \${2:SFVec3f param}",
          "] {",
              "\\t\${3:node}",
          "}"
      ],
      "description": ""
  },
  "PROFILE": {
      "prefix": "PROFILE",
      "body": [
          "PROFILE \${1:Interchange}"
      ],
      "description": ""
  }
}
`);

readFiles('../nodes-specification/').then(files => {
  let source = '';
  files.forEach(f => {
    source += f.content + '\n';
  });
  const data = (new Parser()).execute(source);
  const output = { ...predefineSnippets };
  const keywords = {};
  for (let x3dName in data) {
    const x3d = data[x3dName];
    const snippet = {};
    snippet.prefix = x3dName;
    snippet.description = '';
    snippet.body = [`${x3dName} {`];
    let count = 1;
    for (let j = 0; j < x3d.parents.length; j += 1) {
      const x3dRef = data[x3d.parents[j]];
      if (!x3dRef) {
        console.log('Missing ', x3d.parents[j]);
        continue;
      }
      for (let i = 0; i < x3dRef.fields.length; i += 1) {
        const field = x3dRef.fields[i];
        let s = `\t${field.name} \${${count}:${field.value ? field.value : '<' + field.type + '>' }}`;
        snippet.body.push(s);
        keywords[field.name] = true;
        keywords[field.type] = true;
        count++;
      }
    }
    snippet.body.push('}');
    output[x3dName] = snippet;
  }
  for (let keyword in keywords) {
    const snippet = {};
    snippet.prefix = keyword;
    snippet.description = '';
    snippet.body = [`${keyword}`];
    snippet.body.push('}');
    output[keyword] = snippet;
  }

  fs.writeFile('snippets.json', JSON.stringify(output, null, "\t"), function (err) {
    if (err) throw err;
    console.log('Saved!');
  });
});