// FROM: https://gist.github.com/lttlrck/4129238

//     Int64.js
//
//     Copyright (c) 2012 Robert Kieffer
//     MIT License - http://opensource.org/licenses/mit-license.php

/**
 * Support for handling 64-bit int numbers in Javascript (node.js)
 *
 * JS Numbers are IEEE-754 binary double-precision floats, which limits the
 * range of values that can be represented with integer precision to:
 *
 * 2^^53 <= N <= 2^53
 *
 * Int64 objects wrap a node Buffer that holds the 8-bytes of int64 data.  These
 * objects operate directly on the buffer which means that if they are created
 * using an existing buffer then setting the value will modify the Buffer, and
 * vice-versa.
 *
 * Internal Representation
 *
 * The internal buffer format is Big Endian.  I.e. the most-significant byte is
 * at buffer[0], the least-significant at buffer[7].  For the purposes of
 * converting to/from JS native numbers, the value is assumed to be a signed
 * integer stored in 2's complement form.
 *
 * For details about IEEE-754 see:
 * http://en.wikipedia.org/wiki/Double_precision_floating-point_format
 */

//
// Int64
//

/**
 * Constructor accepts any of the following argument types:
 *
 * new Int64(string)             - Hex string (throws if n is outside int64 range)
 * new Int64(number)             - Number (throws if n is outside int64 range)
 * new Int64(hi, lo)             - Raw bits as two 32-bit values
 */


var _ = require('lodash');

var Int64 = function(a1) {
  this.storage = this.storage || new Array(8);
  this.setValue.apply(this, arguments);
};


// Max integer value that JS can accurately represent
Int64.MAX_INT = Math.pow(2, 53);

// Min integer value that JS can accurately represent
Int64.MIN_INT = -Math.pow(2, 53);

Int64.HexTable = new Array(256);
for (var i = 0; i < 256; i++) {
  Int64.HexTable[i] = (i > 0xF ? '' : '0') + i.toString(16);
}

Int64.prototype = {
  /**
   * Do in-place 2's compliment.  See
   * http://en.wikipedia.org/wiki/Two's_complement
   */
  _2scomp: function() {
    var b = this.storage, o = o, carry = 1;
    for (var i = o + 7; i >= o; i--) {
      var v = (b[i] ^ 0xff) + carry;
      b[i] = v & 0xff;
      carry = v >> 8;
    }
  },

  // TODO: make this private
  /**
   * Set the value. Takes any of the following arguments:
   *
   * setValue(string) - A hexidecimal string
   * setValue(number) - Number (throws if n is outside int64 range)
   * setValue(hi, lo) - Raw bits as two 32-bit values
   */

  setValue: function(hi, lo) {
    var negate = false;
    if (arguments.length == 1) {
      if (typeof(hi) == 'number') {
        // Simplify bitfield retrieval by using abs() value.  We restore sign
        // later
        negate = hi < 0;
        hi = Math.abs(hi);
        lo = hi % 0x80000000;
        hi = hi / 0x80000000;
        if (hi > 0x80000000) throw new RangeError(hi  + ' is outside Int64 range');
        hi = hi | 0;
      } else if (typeof(hi) == 'string') {
        var strArgument = hi;
        if (strArgument[0] === '0' && strArgument[1] == 'x') {
          hi = (hi + '').replace(/^0x/, '');
          lo = hi.substr(-8);
          hi = hi.length > 8 ? hi.substr(0, hi.length - 8) : '';
          hi = parseInt(hi, 16);
          lo = parseInt(lo, 16);
        } else {
          // number in string
          // '372528006791240803'
        };
      } else {
        throw new Error(hi + ' must be a Number or String');
      }
    }

    // Technically we should throw if hi or lo is outside int32 range here, but
    // it's not worth the effort. Anything past the 32'nd bit is ignored.
    // Copy bytes to buffer
    for (var i = 7; i >= 0; i--) {
      this.storage[i] = lo & 0xff;
      lo = i == 4 ? hi : lo >>> 8;
    }

    // Restore sign of passed argument
    if (negate) this._2scomp();
  },

  /**
   * Convert to a native JS number.
   *
   * WARNING: Do not expect this value to be accurate to integer precision for
   * large (positive or negative) numbers!
   *
   * @param allowImprecise If true, no check is performed to verify the
   * returned value is accurate to integer precision.  If false, imprecise
   * numbers (very large positive or negative numbers) will be forced to +/-
   * Infinity.
   */
  toNumber: function(allowImprecise) {
    var b = this.storage, o = 0;

    // Running sum of octets, doing a 2's complement
    // TODO: fix negate
    // var negate = b[0] & 0x80,
    var negate = false,
        x = 0,
        carry = 1;
    for (var i = 7, m = 1; i >= 0; i--, m *= 256) {
      var v = b[o+i];

      // 2's complement for negative numbers
      if (negate) {
        v = (v ^ 0xff) + carry;
        carry = v >> 8;
        v = v & 0xff;
      }

      x += v * m;
    }

    // Return Infinity if we've lost integer precision
    if (!allowImprecise && x >= Int64.MAX_INT) {
      return negate ? -Infinity : Infinity;
    }

    return negate ? -x : x;
  },

  /**
   * Convert to a JS Number. Returns +/-Infinity for values that can't be
   * represented to integer precision.
   */
  valueOf: function() {
    return this.toNumber(false);
  },

  low32: function() {
    this.num & 0xFFFFFFFF
  },

  high32: function() {
    // this.storage, o = o, carry = 1;
    // for (var i = o + 7; i >= o; i--) {
    //   var v = (b[i] ^ 0xff) + carry;
    //   b[i] = v & 0xff;
    //   carry = v >> 8;
    // }

    // num >> 32
  },

  /**
   * Return string value
   */
  toString: function() {
    var val = this.storage.map(function(b){ return Int64.HexTable[b]; }).join("");
    // TODO: fix negate ?
    // var negate = this.storage[0] & 0x80;
    // var sign = (negate ? "-" : "");
    return "0x" + val;
  },

  /**
   * Returns a number indicating whether this comes before or after or is the
   * same as the other in sort order.
   *
   * @param {Int64} other  Other Int64 to compare.
   */
  compare: function(other) {
    if (!_.isObject(other)) { throw("Object expected"); };

    // If sign bits differ
    if ((this.storage[0] & 0x80) != (other.storage[0] & 0x80)) {
      return other.storage[0] - this.storage[0];
    }

    // otherwise, compare bytes lexicographically
    for (var i = 0; i < 8; i++) {
      if (this.storage[i] !== other.storage[i]) {
        return this.storage[i] - other.storage[i];
      }
    }
    return 0;
  },

  /**
   * Returns a boolean indicating if this integer is equal to other.
   *
   * @param {Int64} other  Other Int64 to compare.
   */
  equals: function(other) {
    return this.compare(other) === 0;
  },

  // add: function(other) {
  //   if (_.isNumber(other)) { other = new Int64(other); }
  //   var out = Array(8);
  //   for (var i = 7; i >= 0; i--) {
  //     console.log(this.storage[i].toString(2), other.storage[i].toString(2))

  //   }
  //   // console.log("ADD", this.storage, other.storage);s
  //   // boolean add
  //   // return a new Int64 instance
  // },

  // sub: function(other) {
  //   if (_.isNumber(other)) {
  //     other = new Int64(other);
  //   }

  //   // boolean sub
  //   // return a new Int64 instance
  // },

  and: function(other) {
    if (!_.isObject(other)) { other = new Int64(other); }

    var res = Array(8);
    for (var i = 7; i >= 0; i--) {
      res[i] = this.storage[i] & other.storage[i];
    }

    // TODO: fix negate ?
    var asHexa = "0x" + res.map(function(b){ return Int64.HexTable[b]; }).join("");
    return new Int64(asHexa);
  },

  or: function(other) {
    if (!_.isObject(other)) { other = new Int64(other); }
    console.log(".............")
    var res = Array(8);
    for (var i = 7; i >= 0; i--) {
      res[i] = this.storage[i] | other.storage[i];
      console.log(res[i].toString(2) + "=" + this.storage[i].toString(2) + "|" + other.storage[i].toString(2))
    }

    // TODO: fix negate ?
    var asHexa = "0x" + res.map(function(b){ return Int64.HexTable[b]; }).join("");

    console.log(".............")
    return new Int64(asHexa);

  },

  xor: function(other) {
    if (!_.isObject(other)) { other = new Int64(other); }

    var res = Array(8);
    for (var i = 7; i >= 0; i--) {
      res[i] = this.storage[i] ^ other.storage[i];
    }

    // TODO: fix negate ?
    var asHexa = "0x" + res.map(function(b){ return Int64.HexTable[b]; }).join("");
    return new Int64(asHexa);
  },

  shiftLeft: function(shiftBy) {
    var buff = "";
    for (var i = 7; i >= 0; i--) { buff += this.storage[i].toString(2); }

    function zeros(len){
      var retval="";
      for (var i=0;i<len;++i) { retval+="0"; }
      return retval;
    }

    var result = _.trunc((buff + zeros(shiftBy)), 64);

    // var asHexa = "0x" + res.map(function(b){ return Int64.HexTable[b]; }).join("");
  },

  shiftRight: function(shiftBy) {
    return new Int64(this.storage >> shiftBy);
  }

};

module.exports = Int64;