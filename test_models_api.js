// Simple test to check if models API is working in the browser
async function testModelsAPI() {
  try {
    console.log('Testing models API...');
    const response = await fetch('/api/models');
    const data = await response.json();
    console.log('Raw API response:', data);
    
    if (data.data && Array.isArray(data.data)) {
      console.log(`Found ${data.data.length} models:`);
      data.data.forEach(model => {
        console.log(`- ${model.name} (${model.provider}/${model.model}) ${model.isActive ? '[Active]' : '[Inactive]'}`);
      });
    } else {
      console.error('API response is not in expected format');
    }
  } catch (error) {
    console.error('Error calling models API:', error);
  }
}

// Also test the transformation logic
async function testTransformation() {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    
    // Simulate the transformation in getAvailableModels
    const allModels = data.data;
    const modelOptions = allModels.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      tags: model.tags || [],
      provider: model.provider,
      model: model.model,
      isDefault: model.isDefault || false,
      isActive: model.isActive || false
    }));
    
    console.log('Transformed model options:', modelOptions);
  } catch (error) {
    console.error('Error in transformation:', error);
  }
}

console.log('=== Models API Test ===');
testModelsAPI();
testTransformation();