import tensorflow as tf

# Carregar o modelo treinado
model = tf.keras.models.load_model('exported_model')

# Converter para o formato TFLite
converter = tf.lite.TFLiteConverter.from_keras_model(model)
tflite_model = converter.convert()

# Salvar o modelo TFLite
with open('modelo_convertido.tflite', 'wb') as f:
    f.write(tflite_model)