const { formatStemBlocks } = require("../../utils/mathDisplay");

Component({
  properties: {
    text: { type: String, value: "" },
  },
  data: { blocks: [] },
  observers: {
    text(v) {
      this.setData({ blocks: formatStemBlocks(v || "") });
    },
  },
});
