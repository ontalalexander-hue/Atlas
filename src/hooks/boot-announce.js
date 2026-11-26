export default {
  name: "boot-announce",
  events: ["boot:ready"],
  handler: async () => {
    console.log("[hooks] Atlas is fully initialized and ready.");
  },
};
