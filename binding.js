var Enti = require('enti'),
    EventEmitter = require('events').EventEmitter,
    is = require('./is'),
    looser = require('./looser'),
    same = require('same-value');

function fuseBinding(){
    var bindings = Array.prototype.slice.call(arguments),
        transform = bindings.pop(),
        updateTransform,
        resultBinding = createBinding('result'),
        selfChanging;

    if(typeof bindings[bindings.length-1] === 'function' && !is.binding(bindings[bindings.length-1])){
        updateTransform = transform;
        transform = bindings.pop();
    }

    resultBinding._set = function(value){
        if(updateTransform){
            selfChanging = true;
            var newValue = updateTransform(value);
            if(!same(newValue, bindings[0]())){
                bindings[0](newValue);
                resultBinding._change(newValue);
            }
            selfChanging = false;
        }else{
            resultBinding._change(value);
        }
    };

    function change(){
        if(selfChanging){
            return;
        }
        resultBinding(transform.apply(null, bindings.map(function(binding){
            return binding();
        })));
    }

    bindings.forEach(function(binding, index){
        if(typeof binding === 'string'){
            binding = createBinding(binding);
            bindings.splice(index,1,binding);
        }
        binding.on('change', change);
        resultBinding.on('detach', binding.detach);
    });

    resultBinding.on('attach', function(object){
        selfChanging = true;
        bindings.forEach(function(binding){
            binding.attach(object, 1);
        });
        selfChanging = false;
        change();
    });

    return resultBinding;
}

function createBinding(keyAndFilter){
    var args = Array.prototype.slice.call(arguments);

    if(args.length > 1){
        return fuseBinding.apply(null, args);
    }

    keyAndFilter = keyAndFilter.toString();

    var keyAndFilterParts = keyAndFilter.split('|'),
        key = keyAndFilterParts[0],
        filter = keyAndFilterParts[1] ? ((key === '.' ? '' : key + '.') + keyAndFilterParts[1]) : key;

    if(filter === '.'){
        filter = '*';
    }

    var value,
        binding = function binding(newValue){
        if(!arguments.length){
            return value;
        }

        if(key === '.'){
            return;
        }

        binding._set(newValue);
    };
    for(var emitterKey in EventEmitter.prototype){
        binding[emitterKey] = EventEmitter.prototype[emitterKey];
    }
    binding.setMaxListeners(10);
    binding.model = new Enti(),
    binding._fastn_binding = key;
    binding._loose = 1;
    binding.model._events = {};

    binding.attach = function(object, loose){

        // If the binding is being asked to attach loosly to an object,
        // but it has already been defined as being firmly attached, do not attach.
        if(looser(binding, loose)){
            return binding;
        }

        binding._loose = loose;

        if(object instanceof Enti){
            object = object._model;
        }

        if(!(object instanceof Object)){
            object = {};
        }

        if(binding.model.get('.') === object){
            return binding;
        }

        binding.model.attach(object);
        binding._scope = object;
        binding._change(binding.model.get(key), false);
        binding.emit('attach', object, 1);
        binding.emit('change', binding());
        return binding;
    };
    binding.detach = function(loose){
        if(looser(binding, loose)){
            return binding;
        }

        value = undefined;
        binding.model.detach();
        binding._scope = null;
        binding.emit('detach', 1);
        return binding;
    };
    binding._set = function(newValue){
        if(same(binding.model.get(key), newValue)){
            return;
        }
        binding.model.set(key, newValue);
    };
    binding._change = function(newValue, emit){
        value = newValue;
        if(emit !== false){
            binding.emit('change', binding());
        }
    };
    binding.clone = function(){
        return createBinding.apply(null, args);
    };
    binding.destroy = function(){
        binding.model._events = {};
        binding.detach();
    };

    binding.model._events[filter] = function(){
        binding._change(binding.model.get(key));
    }

    return binding;
}

module.exports = createBinding;