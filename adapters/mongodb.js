const mongoose = require('mongoose');
const Logger = require('../core/logger');

class MongoDBAdapter {
  constructor() {
    this.connection = null;
    this.models = {};
  }

  async connect(connectionString, models) {
    try {
      this.connection = await mongoose.connect(connectionString, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });

      this.buildModels(models);
      Logger.debug('MongoDB models built successfully');
    } catch (error) {
      throw new Error(`MongoDB connection failed: ${error.message}`);
    }
  }

  buildModels(models) {
    for (const model of models) {
      const schema = new mongoose.Schema(model.schema, {
        timestamps: true,
        collection: model.name.toLowerCase()
      });

      this.models[model.name] = mongoose.model(model.name, schema);
    }
  }

  async query(modelName, operation, data = null, options = {}) {
    const model = this.models[modelName];
    if (!model) {
      throw new Error(`Model '${modelName}' not found`);
    }

    switch (operation.toLowerCase()) {
      case 'findall':
        return model.find(options.filter || {}).limit(options.limit || 100);

      case 'findbyid':
        return model.findById(data);

      case 'findone':
        return model.findOne(options.filter || {});

      case 'create':
        return model.create(data);

      case 'updatebyid':
        return model.findByIdAndUpdate(data.id, data.updates, { new: true });

      case 'deletebyid':
        return model.findByIdAndDelete(data);

      case 'delete':
        return model.deleteMany(options.filter || {});

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
    }
  }
}

module.exports = MongoDBAdapter;
