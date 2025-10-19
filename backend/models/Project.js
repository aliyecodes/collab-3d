const mongoose = require('mongoose');

const AnnotationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },        
    text: { type: String, default: '' },
    user: { type: String, default: 'Anon' },

    position: {
      type: [Number],                         
      default: undefined,
    },

    anchor: {
      objectId: { type: String, default: undefined },
      local: { type: [Number], default: undefined }, 
    },
  },
  { _id: false }
);

const ObjectSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },      
    type: { type: String, required: true },    
    position: { type: [Number], default: [0, 0, 0] },
    rotation: { type: [Number], default: [0, 0, 0] },
    scale:    { type: [Number], default: [1, 1, 1] },
  },
  { _id: false }
);

const ChatSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },  
    user: { type: String, default: 'Anon' },
    text: { type: String, default: '' },
    ts:   { type: Number, default: () => Date.now() },
  },
  { _id: false }
);

const SceneStateSchema = new mongoose.Schema(
  {
    camera: {
      position: { type: [Number], default: undefined }, 
      target:   { type: [Number], default: undefined }, 
    },
    objects:     { type: [ObjectSchema], default: [] },
    annotations: { type: [AnnotationSchema], default: [] },
    chat:        { type: [ChatSchema], default: [] },
  },
  { _id: false }
);

const ProjectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    sceneState: {
      type: SceneStateSchema,
      default: () => ({ objects: [], annotations: [], chat: [] }),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', ProjectSchema);
