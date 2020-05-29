// const parser = require('./');
// const out = console.log

// // out(parser)
// const body = `
// @name asdfasdf
// @description
// Create a Matrix. The function creates a new \`math.Matrix\` object from
// an \`Array\`. A Matrix has utility functions to manipulate the data in the
// matrix, like getting the size and getting or setting values in the matrix.
// Supported storage formats are 'dense' and 'sparse'.

// Syntax:

//    math.matrix()                         // creates an empty matrix using default storage format (dense).
//    math.matrix(data)                     // creates a matrix with initial data using default storage format (dense).
//    math.matrix('dense')                  // creates an empty matrix using the given storage format.
//    math.matrix(data, 'dense')            // creates a matrix with initial data using the given storage format.
//    math.matrix(data, 'sparse')           // creates a sparse matrix with initial data.
//    math.matrix(data, 'sparse', 'number') // creates a sparse matrix with initial data, number data type.

// Examples:

//    let m = math.matrix([[1, 2], [3, 4]])
//    m.size()                        // Array [2, 2]
//    m.resize([3, 2], 5)
//    m.valueOf()                     // Array [[1, 2], [3, 4], [5, 5]]
//    m.get([1, 0])                    // number 3

// See also:

//    bignumber, boolean, complex, index, number, string, unit, sparse

// @param {Array | Matrix} [data]    A multi dimensional array
// @param {string} [format]          The Matrix storage format

// @return {Matrix} The created matrix`;


// const body2 = `
// @name asdfasdf
// @synopsis asdfasdf
// @param {Array | Matrix} [data]    A multi dimensional array
// @param {string} [format]          The Matrix storage format

// @return {Matrix} The created matrix`;



// // out(parser(body2, {}))

// out(parser(body, { mdDescriptionTag: 'description', mdFunctionNameTag: 'name', inputLooseTags: true, trim:false }))