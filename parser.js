
'use strict'
var mdescape = require('markdown-escape')
var assert = require('assert')
const PARSERS = require('./parsers')
var sentenceSplitter = require("sentence-splitter")
const out = console.log

const MARKER_START = '/**'
const MARKER_START_SKIP = '/***'
const MARKER_END = '*/'

/* ------- util functions ------- */

function find(list, filter) {
  let i = list.length
  let matchs = true

  while (i--) {
    for (const k in filter) {
      if ({}.hasOwnProperty.call(filter, k)) {
        matchs = (filter[k] === list[i][k]) && matchs
      }
    }
    if (matchs) { return list[i] }
  }
  return null
}

/* ------- parsing ------- */

/**
 * Parses "@tag {type} name description"
 * @param {string} str Raw doc string
 * @param {Array<function>} parsers Array of parsers to be applied to the source
 * @returns {object} parsed tag node
 */
function parse_tag(str, parsers) {
  const data = parsers.reduce(function (state, parser) {
    let result

    try {
      result = parser(state.source, Object.assign({}, state.data))
    } catch (err) {
      state.data.errors = (state.data.errors || [])
        .concat(parser.name + ': ' + err.message)
    }

    if (result) {
      state.source = state.source.slice(result.source.length)
      state.data = Object.assign(state.data, result.data)
    }

    return state
  }, {
    source: str,
    data: {}
  }).data

  data.optional = !!data.optional
  data.type = data.type === undefined ? '' : data.type
  data.name = data.name === undefined ? '' : data.name
  data.description = data.description === undefined ? '' : data.description

  return data
}

/**
 * Parses comment block (array of String lines)
 */
function parse_block(source, opts) {
  const trim = opts.trim
    ? s => s.trim()
    : s => s

  const toggleFence = (typeof opts.fence === 'function')
    ? opts.fence
    : line => line.split(opts.fence).length % 2 === 0

  let source_str = source
    .map((line) => { return trim(line.source) })
    .join('\n')

  source_str = trim(source_str)

  const start = source[0].number

  // merge source lines into tags
  // we assume tag starts with "@"
  source = source
    .reduce(function (state, line) {
      line.source = trim(line.source)

      // start of a new tag detected
      if (line.source.match(/^\s*@(\S+)/) && !state.isFenced) {
        state.tags.push({
          source: [line.source],
          line: line.number
        })
        // keep appending source to the current tag
      } else {
        const tag = state.tags[state.tags.length - 1]
        if (opts.join !== undefined && opts.join !== false && opts.join !== 0 &&
          !line.startWithStar && tag.source.length > 0) {
          let source
          if (typeof opts.join === 'string') {
            source = opts.join + line.source.replace(/^\s+/, '')
          } else if (typeof opts.join === 'number') {
            source = line.source
          } else {
            source = ' ' + line.source.replace(/^\s+/, '')
          }
          tag.source[tag.source.length - 1] += source
        } else {
          tag.source.push(line.source)
        }
      }

      if (toggleFence(line.source)) {
        state.isFenced = !state.isFenced
      }
      return state
    }, {
      tags: [{ source: [] }],
      isFenced: false
    })
    .tags
    .map((tag) => {
      tag.source = trim(tag.source.join('\n'))
      return tag
    })

  // Block description
  const description = source.shift()

  // skip if no descriptions and no tags
  if (description.source === '' && source.length === 0) {
    return null
  }

  const tags = source.reduce(function (tags, tag) {
    const tag_node = parse_tag(tag.source, opts.parsers)

    tag_node.line = tag.line
    tag_node.source = tag.source

    if (opts.dotted_names && tag_node.name.includes('.')) {
      let parent_name
      let parent_tag
      let parent_tags = tags
      const parts = tag_node.name.split('.')

      while (parts.length > 1) {
        parent_name = parts.shift()
        parent_tag = find(parent_tags, {
          tag: tag_node.tag,
          name: parent_name
        })

        if (!parent_tag) {
          parent_tag = {
            tag: tag_node.tag,
            line: Number(tag_node.line),
            name: parent_name,
            type: '',
            description: ''
          }
          parent_tags.push(parent_tag)
        }

        parent_tag.tags = parent_tag.tags || []
        parent_tags = parent_tag.tags
      }

      tag_node.name = parts[0]
      parent_tags.push(tag_node)
      return tags
    }

    return tags.concat(tag_node)
  }, [])

  return {
    tags,
    line: start,
    description: description.source,
    source: source_str
  }
}

/**
 * Produces `extract` function with internal state initialized
 */
function mkextract(opts) {
  let chunk = null
  let indent = 0
  let number = 0

  opts = Object.assign({}, {
    trim: true,
    dotted_names: false,
    fence: '```',
    parsers: [
      PARSERS.parse_tag,
      PARSERS.parse_type,
      PARSERS.parse_name,
      PARSERS.parse_description
    ]
  }, opts || {})

  /**
   * Read lines until they make a block
   * Return parsed block once fullfilled or null otherwise
   */
  return function extract(line) {
    let result = null
    const startPos = line.indexOf(MARKER_START)
    const endPos = line.indexOf(MARKER_END)

    // if open marker detected and it's not, skip one
    if (startPos !== -1 && line.indexOf(MARKER_START_SKIP) !== startPos) {
      chunk = []
      indent = startPos + MARKER_START.length
    }

    // if we are on middle of comment block
    if (chunk) {
      let lineStart = indent
      let startWithStar = false

      // figure out if we slice from opening marker pos
      // or line start is shifted to the left
      const nonSpaceChar = line.match(/\S/)

      // skip for the first line starting with /** (fresh chunk)
      // it always has the right indentation
      if (chunk.length > 0 && nonSpaceChar) {
        if (nonSpaceChar[0] === '*') {
          const afterNonSpaceCharIdx = nonSpaceChar.index + 1
          const extraCharIsSpace = line.charAt(afterNonSpaceCharIdx) === ' '
          lineStart = afterNonSpaceCharIdx + (extraCharIsSpace ? 1 : 0)
          startWithStar = true
        } else if (nonSpaceChar.index < indent) {
          lineStart = nonSpaceChar.index
        }
      }

      // slice the line until end or until closing marker start
      chunk.push({
        number,
        startWithStar,
        source: line.slice(lineStart, endPos === -1 ? line.length : endPos)
      })

      // finalize block if end marker detected
      if (endPos !== -1) {
        result = parse_block(chunk, opts)
        chunk = null
        indent = 0
      }
    }

    number += 1
    return result
  }
}

/* ------- Public API ------- */

module.exports = function parse(source, opts = {}) {

  if (opts.wrangl) {  //TODO - remove all custom opts except for "wrangl"

    source = source.trim();
    if (opts.wrangl2) {
      //no more "@name" and @synopsis tag.  naem from frist line, synopsis from first sentence of description.
      //first word of comment is app name
      let name = source.split(/\s+/)[0];
      source = source.replace(name, '');

      //now get first sentence - make it the synopsis
      // out('sentenceSplitter.split(source.trim())')
      // out(sentenceSplitter.split(source.trim()))
      let synopsis = sentenceSplitter.split(source.trim())[0].raw
      source = '@description ' + source;
      source = `@synopsis ${synopsis}\n` + source;
      source = `@name ${name}\n` + source;

    }

    source = source.replace('@name', '\n@name');
    source = source.replace('@synopsis', '\n@synopsis');
    source = source.replace('@description', '\n@description');

    if (opts.inputLooseTags) {
      let lines = source.split('\n');
      source = '/**\n';
      lines.forEach(l => source += ` * ${l}\n`);
      source += '*/\n';

    }
    // console.log('what up from comment-parser !!!!');
  }
  const blocks = []
  const extract = mkextract(opts)
  const lines = source.split(/\n/)

  lines.forEach((line) => {
    const block = extract(line)
    if (block) {
      blocks.push(block)
    }
  })
  if (!opts.wrangl) {
    return blocks;
  } else {
    //updates by stuart start here - supporting varargs and multiple types

    // console.log('asdfawefawef blocks:');
    // console.log(blocks);

    // const tags = blocks[0]

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const tags = block.tags;
      // console.log('######################################################################');

      tags.forEach(t => {
        const singleValue = t.name.trim() + ' ' + t.description.trim();
        t.singleValue = singleValue.trim();
      });

      for (let k = 0; k < tags.length; k++) {
        const tag = tags[k];
        // console.log(tag);
        let type = tag.type.slice();



        /* removing leading hyphen in descriptions */

        if (tag.description && tag.description.startsWith('- ')) {
          tag.description = tag.description.slice(2)
        }

        /* handle optional (by {string=} notation) */

        if (type.endsWith('=')) {
          type = type.slice(0, type.length - 1);
          tag.optional = true;
        }

        /* handle varargs */

        if (type.startsWith('...')) {
          type = type.slice(3);
          tag.varargs = true;
        }

        /* handle multiple types */

        let types = [];
        if (type && type.startsWith('(') && type.endsWith(')') && type.includes('|')) {
          type = type.slice(1, type.length - 1);
          types = type.split('|');
        }
        else {
          types = [type];
        }

        /* handle array type (1st order bracket notation only) */

        for (let q = 0; q < types.length; q++) {
          let t = types[q];
          if (t.endsWith('[]')) {
            t = t.slice(0, t.length - 2);
            t = 'Array<' + t + '>';
          }
          types[q] = t;
        }

        // /* handle missing type (dont use empty string) */

        let typesFound = types.find(t => t !== '');

        if (typesFound) {
          tag.types = types;
        }
      }
    }
    let response = {};
    response.blocks = blocks;
    response.markdowns = blocks.map(b => toMarkdown(b, opts).md);
    response.markdownCharts = blocks.map(b => toMarkdown(b, opts).mdChart);
    return response;
  }
}


// function getMarkdownParamsAndReturnChart
// function addFormattedSigParams(tags) {
//   const paramStrs = tags
//   tags = tags
//     .filter(t => t.tag === "param")
//     .map(t => {
//       let str = t.name;
//       if (t.varargs) { str = '...' + str; }
//       else if (t.optional) { str = '?' + str }
//       return str;
//     });
// }

function addFormattedSigParams(tags) {
  tags = tags.map(t => {
    if (t.tag === "param") {
      let str = t.name;
      if (t.varargs) { str = '...' + str; }
      else if (t.optional) { str = '?' + str }
      t.formattedName = str;
    }
    return t;
  });
  return tags;
}

function getFormattedTypeString(tag) {
  // "types": [
  //   "string",
  //   "Array<string>"
  // ],

  if (tag.types === undefined) return '';
  const joined = tag.types
    .map(t => mdescape(t))
    .join("</code> \\| <code>");                //\\ is to escape markdown
  return '<code>' + joined + '</code>';
}

/**
 * has to know when to escape '<' (everything except <code> and </code> and <span></span>???)
 * or ... only: <number, <string, <*, <col, <mat
 * ... yeah just escape all these at the very end 
 * @param {*} block 
 * @param {*} opts 
 */
function toMarkdown(block, opts = {}) {
  const whitelist = opts.mdTagWhitelist;
  const descriptionTag = opts.mdDescriptionTag;
  const functionNameTag = opts.mdFunctionNameTag;
  // asdfff;
  let tags = block.tags;
  tags = addFormattedSigParams(tags);

  if (!tags) {
    return '';
  }

  const returnTag = tags.find(t => t.tag === 'returns');
  // console.log(returnTag);
  const returnType = returnTag && returnTag.types && returnTag.types[0];

  let md = '';

  // first generate the signature, like:
  // ## protection(cloak, dagger) ⇒ <code>returnType</code>
  if (functionNameTag) {
    let functionNameObjectFound = tags.find(t => t.tag === functionNameTag);
    let functionName = functionNameObjectFound && functionNameObjectFound.name;
    if (functionName) {
      const formattedSigParams = tags.filter(t => t.formattedName).map(t => t.formattedName);
      let sig;
      sig = `## ${functionName} (`;
      formattedSigParams.forEach(p => sig = `${sig}${p}, `);
      sig = sig.slice(0, sig.length - 2) + ')';
      if (returnType) {
        sig += ` ⇒ <code>${returnType}</code>`;
      }
      md += sig + '\n\n';
    }
  }

  // /* now append the synopsis */

  // const synopsisObj = tags.find(t => t.tag === 'synopsis');
  // if (synopsisObj) {
  //   const synopsis = synopsisObj.name + ' ' + synopsisObj.description;

  //   md += `<span id="mdSynopsis">${synopsis}</span>`

  //   md += '\n\n';
  // }

  /* now append the description */

  let description = '';
  if (descriptionTag) {
    let descriptionTagObj = tags.find(t => t.tag === 'description');
    if (descriptionTagObj) {
      description = descriptionTagObj.name + ' ' + descriptionTagObj.description;
    }
  }
  else {
    description = block.description;
  }
  md += description + '\n\n';


  let mdChart = '';

  /* now for the params chart */

  /*
  | Param  | Type                | Description  |
  | ------ | ------------------- | ------------ |
  | cloak  | <code>object</code> | privacy gown |
  | dagger | <code>object</code> | security     |
  */


  let hasDefault = tags.find(t => t.default);
  // let 
  let header = hasDefault ?
    `
| Param  | Type    | Default | Description  |
| ------ | --------| ------- | ------------ |`
    :
    `
| Param  | Type    | Description  |
| ------ | --------| ------------ |`;

  mdChart += header + '\n';

  const params = tags.filter(t => t.tag === "param");

  params.forEach(t => {
    const typeString = getFormattedTypeString(t);
    let defaultStr = t.default ? t.default : '';
    if (defaultStr) {
      defaultStr = `<code>${defaultStr}</code>`
    }
    const desc = t.description ? t.description : '';

    if (hasDefault) {
      mdChart += `| ${t.formattedName} | ${typeString} | ${defaultStr} |  ${desc} |\n`
    }
    else {
      mdChart += `| ${t.formattedName} | ${typeString} |   ${desc} |\n`
    }
  })

  //now escape definitely-not-html things lke:
  //  <number, <string, <*, <col, <matr
  //  <Number, <String, <*, <Col, <Matr

  //uh... this isn't how u escape html ... 

  // mdChart = mdChart.replace(/<num/g, '\\<num');
  // mdChart = mdChart.replace(/<string/g, '\\<string');
  // mdChart = mdChart.replace(/<\*/g, '\\<*');
  // mdChart = mdChart.replace(/<col/g, '\\<col');
  // mdChart = mdChart.replace(/<matr/g, '\\<matr');
  // mdChart = mdChart.replace(/<Number/g, '\\<Number');
  // mdChart = mdChart.replace(/<String/g, '\\<String');
  // mdChart = mdChart.replace(/<Col/g, '\\<Col');
  // mdChart = mdChart.replace(/<Matr/g, '\\<Matr');
  // mdChart = mdChart.replace(/<num/g, '\\<num');
  md += mdChart + '\n\n';

  // now add returns line at bottom
  if (returnTag) {
    const returnsLine = `**returns** <code>${returnType ? returnType : ''}</code> ${returnTag ? returnTag.description : ''}`
    md += returnsLine + '\n';
  }
  return { md, mdChart };

}

module.exports.PARSERS = PARSERS
module.exports.mkextract = mkextract
