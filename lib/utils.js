'use strict';

module.exports.tryParse = function tryParse (data) {
  try {
    return JSON.parse(data);
  } catch (err) {
    return data;
  }
};
